import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../../utils/logger';

const log = createLogger('UIAWrapper');
const execAsync = promisify(exec);

// PowerShell scripts - using explicit newlines via \n
const GET_FOCUSED_ELEMENT_PS = [
  'Add-Type -AssemblyName UIAutomationClient',
  '$ae = [System.Windows.Automation.AutomationElement]::FocusedElement',
  'if ($ae -eq $null) { exit 0 }',
  '$r = $ae.Current.BoundingRectangle',
  'Write-Output "$($ae.Current.Name)|$($ae.Current.ControlType.ProgrammaticName.Split(\'.\')[-1])|$($r.Left),$($r.Top),$($r.Width),$($r.Height)|$($ae.Current.IsEnabled)|$($ae.Current.HasKeyboardFocus)|$($ae.Current.AutomationId)|$($ae.Current.ClassName)|$($ae.Current.HelpText)"',
].join('\n');

const FIND_CHILDREN_ROOT_PS = (maxCount: number) => [
  `param([int]$MaxCount = ${maxCount})`,
  'Add-Type -AssemblyName UIAutomationClient',
  '$desktop = [System.Windows.Automation.AutomationElement]::RootElement',
  '$condition = [System.Windows.Automation.Condition]::TrueCondition',
  '$children = $desktop.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)',
  '$results = @()',
  '$count = 0',
  'foreach ($child in $children) {',
  '  if ($count -ge $MaxCount) { break }',
  '  $name = $child.Current.Name',
  '  if ([string]::IsNullOrWhiteSpace($name)) { continue }',
  '  $r = $child.Current.BoundingRectangle',
  '  $results += "$($name)|$($child.Current.ControlType.ProgrammaticName.Split(\'.\')[-1])|$($r.Left),$($r.Top),$($r.Width),$($r.Height)|$($child.Current.IsEnabled)|$($child.Current.HasKeyboardFocus)|$($child.Current.AutomationId)|$($child.Current.ClassName)|$($child.Current.HelpText)"',
  '  $count++',
  '}',
  'Write-Output ($results -join "\\n")',
].join('\n');

const FIND_CHILDREN_OF_ELEMENT_PS = (handle: string, maxCount: number) => [
  `param([string]$Handle = "${handle}", [int]$MaxCount = ${maxCount})`,
  'Add-Type -AssemblyName UIAutomationClient',
  'try {',
  '  $hwnd = [IntPtr][Convert]::ToInt64($Handle, 16)',
  '  $element = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)',
  '  if ($element -eq $null) { exit 0 }',
  '  $condition = [System.Windows.Automation.Condition]::TrueCondition',
  '  $children = $element.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)',
  '  $results = @()',
  '  $count = 0',
  '  foreach ($child in $children) {',
  '    if ($count -ge $MaxCount) { break }',
  '    $name = $child.Current.Name',
  '    if ([string]::IsNullOrWhiteSpace($name)) { continue }',
  '    $r = $child.Current.BoundingRectangle',
  '    $results += "$($name)|$($child.Current.ControlType.ProgrammaticName.Split(\'.\')[-1])|$($r.Left),$($r.Top),$($r.Width),$($r.Height)|$($child.Current.IsEnabled)|$($child.Current.HasKeyboardFocus)|$($child.Current.AutomationId)|$($child.Current.ClassName)|$($child.Current.HelpText)"',
  '    $count++',
  '  }',
  '  Write-Output ($results -join "\\n")',
  '} catch {',
  '  exit 0',
  '}',
].join('\n');

const GET_ELEMENT_AT_POINT_PS = (x: number, y: number) => [
  `param([int]$X = ${x}, [int]$Y = ${y})`,
  'Add-Type -AssemblyName UIAutomationClient',
  '$point = New-Object System.Windows.Point($X, $Y)',
  '$element = [System.Windows.Automation.AutomationElement]::FromPoint($point)',
  'if ($element -eq $null) { exit 0 }',
  '$r = $element.Current.BoundingRectangle',
  'Write-Output "$($element.Current.Name)|$($element.Current.ControlType.ProgrammaticName.Split(\'.\')[-1])|$($r.Left),$($r.Top),$($r.Width),$($r.Height)|$($element.Current.IsEnabled)|$($element.Current.HasKeyboardFocus)|$($element.Current.AutomationId)|$($element.Current.ClassName)|$($element.Current.HelpText)"',
].join('\n');

export interface UIAElement {
  name: string;
  controlType: string;
  controlTypeId: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  isFocused: boolean;
  isEnabled: boolean;
  hasKeyboardFocus: boolean;
  automationId: string;
  className: string;
  helpText: string;
  value: string;
  patternsAvailable: string[];
  childrenCount: number;
  nativeHandle: string;
  children?: UIAElement[];
}

function parseElementLine(line: string): UIAElement | null {
  const parts = line.split('|');
  if (parts.length < 8) return null;

  const [name, controlType, bboxStr, isEnabledStr, hasFocusStr, automationId, className, helpText] = parts;
  if (!name) return null;

  const bboxParts = bboxStr.split(',');
  const bbox = bboxParts.length === 4
    ? { x: parseInt(bboxParts[0], 10), y: parseInt(bboxParts[1], 10), width: parseInt(bboxParts[2], 10), height: parseInt(bboxParts[3], 10) }
    : { x: 0, y: 0, width: 0, height: 0 };

  return {
    name,
    controlType,
    controlTypeId: 0,
    boundingBox: bbox,
    isFocused: hasFocusStr === 'True',
    isEnabled: isEnabledStr !== 'False',
    hasKeyboardFocus: hasFocusStr === 'True',
    automationId: automationId || '',
    className: className || '',
    helpText: helpText || '',
    value: '',
    patternsAvailable: [],
    childrenCount: 0,
    nativeHandle: '',
  };
}

async function runPowerShellScript(script: string): Promise<string> {
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
  const command = `powershell.exe -EncodedCommand ${encodedScript}`;
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 5000, maxBuffer: 1024 * 1024 });
    if (stderr && stderr.trim()) {
      log.debug('PS stderr:', stderr.trim());
    }
    return stdout.trim();
  } catch (error) {
    log.debug('PowerShell script error:', error);
    return '';
  }
}

export async function getFocusedElementViaAutomation(): Promise<UIAElement | null> {
  const output = await runPowerShellScript(GET_FOCUSED_ELEMENT_PS);
  if (!output) return null;

  const element = parseElementLine(output);
  if (!element || !element.name) return null;

  element.isFocused = true;
  element.hasKeyboardFocus = true;
  return element;
}

export async function findChildrenOfRoot(maxCount: number = 50): Promise<UIAElement[]> {
  const script = FIND_CHILDREN_ROOT_PS(maxCount);
  const output = await runPowerShellScript(script);
  if (!output) return [];

  const lines = output.split('\\n').filter(l => l.trim());
  const elements: UIAElement[] = [];

  for (const line of lines) {
    const element = parseElementLine(line);
    if (element) {
      elements.push(element);
    }
  }

  return elements;
}

export async function getChildrenOfElementViaAutomation(handle: string, maxCount: number = 50): Promise<UIAElement[]> {
  if (!handle) return [];
  const script = FIND_CHILDREN_OF_ELEMENT_PS(handle, maxCount);
  const output = await runPowerShellScript(script);
  if (!output) return [];

  const lines = output.split('\\n').filter(l => l.trim());
  const elements: UIAElement[] = [];

  for (const line of lines) {
    const element = parseElementLine(line);
    if (element) {
      elements.push(element);
    }
  }

  return elements;
}

export async function getElementFromPoint(x: number, y: number): Promise<UIAElement | null> {
  const script = GET_ELEMENT_AT_POINT_PS(x, y);
  const output = await runPowerShellScript(script);
  if (!output) return null;

  return parseElementLine(output);
}
