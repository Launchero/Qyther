import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createLogger } from "../../utils/logger";
import type { BrowserSkillMetadata, BrowserSkillContent } from "./types";

const log = createLogger("BrowserSkillLoader");

const __filename = fileURLToPath(import.meta.url);
const SKILLS_DIR = path.join(dirname(__filename), "skills");

export class BrowserSkillLoaderService {
  private catalogCache: BrowserSkillMetadata[] | null = null;
  private skillContentCache: Map<string, BrowserSkillContent> = new Map();

  /**
   * Load the lightweight skill catalog (name + description only).
   * Returns ~500 tokens max for progressive disclosure.
   */
  getCatalog(): BrowserSkillMetadata[] {
    if (this.catalogCache) {
      log.debug(`[SkillLoader] Using cached catalog: ${this.catalogCache.length} skills`);
      return this.catalogCache;
    }

    log.info(`[SkillLoader] Loading skill catalog from: ${SKILLS_DIR}`);

    if (!fs.existsSync(SKILLS_DIR)) {
      log.warn(`Skills directory not found at ${SKILLS_DIR}`);
      return [];
    }

    const skills: BrowserSkillMetadata[] = [];

    for (const skillName of fs.readdirSync(SKILLS_DIR)) {
      const skillPath = path.join(SKILLS_DIR, skillName);
      if (!fs.statSync(skillPath).isDirectory()) continue;

      const skillMdPath = path.join(skillPath, "SKILL.md");
      if (!fs.existsSync(skillMdPath)) continue;

      const metadata = this.parseFrontmatter(skillMdPath);
      if (metadata) {
        log.debug(`[SkillLoader] Discovered skill: "${metadata.name}" (${metadata.category}) - ${metadata.description}`);
        skills.push(metadata);
      }
    }

    this.catalogCache = skills;
    log.info(`[SkillLoader] Loaded ${skills.length} skills from catalog`);
    return skills;
  }

  /**
   * Load full skill instructions for a matched skill.
   * This is the progressive disclosure step 2.
   */
  async loadSkill(skillName: string): Promise<string | null> {
    // Check cache first
    if (this.skillContentCache.has(skillName)) {
      log.debug(`[SkillLoader] Skill "${skillName}" loaded from cache`);
      return this.formatSkillInstructions(this.skillContentCache.get(skillName)!);
    }

    log.info(`[SkillLoader] Loading skill: "${skillName}"`);

    const skillPath = path.join(SKILLS_DIR, skillName, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      log.warn(`[SkillLoader] Skill not found: ${skillName}`);
      return null;
    }

    const content = fs.readFileSync(skillPath, "utf-8");
    const parsed = this.parseFullSkill(content);
    if (!parsed) return null;

    this.skillContentCache.set(skillName, parsed);

    // Load resources if they exist
    const resourcesDir = path.join(SKILLS_DIR, skillName, "references");
    const resources: string[] = [];
    if (fs.existsSync(resourcesDir)) {
      for (const file of fs.readdirSync(resourcesDir)) {
        resources.push(path.join(resourcesDir, file));
        log.debug(`[SkillLoader] Skill "${skillName}" found reference: ${file}`);
      }
    }

    // Load scripts if they exist
    const scriptsDir = path.join(SKILLS_DIR, skillName, "scripts");
    if (fs.existsSync(scriptsDir)) {
      for (const file of fs.readdirSync(scriptsDir)) {
        resources.push(path.join(scriptsDir, file));
        log.debug(`[SkillLoader] Skill "${skillName}" found script: ${file}`);
      }
    }

    const skillContent: BrowserSkillContent = {
      ...parsed,
      resources,
    };

    log.info(`[SkillLoader] Skill "${skillName}" loaded: ${parsed.instructions.length} chars, ${resources.length} resources/scripts`);

    return this.formatSkillInstructions(skillContent);
  }

  /**
   * Match skills to a task based on description keywords.
   */
  matchSkills(task: string, catalog: BrowserSkillMetadata[]): BrowserSkillMetadata[] {
    const lowerTask = task.toLowerCase();
    const matched: BrowserSkillMetadata[] = [];
    const skipped: string[] = [];

    for (const skill of catalog) {
      const descLower = skill.description.toLowerCase();
      // Check if skill description keywords appear in the task
      const keywords = descLower.split(/\s+/).filter(w => w.length > 3);
      const matchCount = keywords.filter(kw => lowerTask.includes(kw)).length;
      if (matchCount >= 1) {
        log.debug(`[SkillLoader] Skill "${skill.name}" matched: ${matchCount} keyword(s) found in task`);
        matched.push(skill);
      } else {
        skipped.push(skill.name);
      }
    }

    log.info(
      `[SkillLoader] Skill matching complete: ${matched.length} matched, ${skipped.length} skipped`,
      matched.length > 0
        ? `Matched: ${matched.map(s => `"${s.name}"`).join(', ')}`
        : 'No skills matched the task'
    );

    return matched;
  }

  private parseFrontmatter(filePath: string): BrowserSkillMetadata | null {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        log.warn(`[SkillLoader] No frontmatter in ${filePath}`);
        return null;
      }

      const frontmatter = frontmatterMatch[1];
      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      const descMatch = frontmatter.match(/description:\s*(.+)/);
      const categoryMatch = frontmatter.match(/category:\s*(.+)/);

      if (!nameMatch || !descMatch) {
        log.warn(`[SkillLoader] Missing name or description in ${filePath}`);
        return null;
      }

      return {
        name: nameMatch[1].trim(),
        description: descMatch[1].trim(),
        category: (categoryMatch?.[1].trim() as BrowserSkillMetadata["category"]) || "interaction",
      };
    } catch (error) {
      log.error(`[SkillLoader] Failed to parse frontmatter for ${filePath}:`, error);
      return null;
    }
  }

  private parseFullSkill(content: string): Omit<BrowserSkillContent, "resources"> | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    const nameMatch = frontmatterMatch[1].match(/name:\s*(.+)/);
    const descMatch = frontmatterMatch[1].match(/description:\s*(.+)/);

    if (!nameMatch || !descMatch) return null;

    // Extract body after frontmatter
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();

    return {
      name: nameMatch[1].trim(),
      description: descMatch[1].trim(),
      instructions: body,
    };
  }

  private formatSkillInstructions(skill: BrowserSkillContent): string {
    let result = `## Skill: ${skill.name}\n`;
    result += `${skill.description}\n\n`;
    result += skill.instructions;

    if (skill.resources && skill.resources.length > 0) {
      result += `\n\n### Reference Files:\n`;
      for (const resourcePath of skill.resources) {
        try {
          const resourceContent = fs.readFileSync(resourcePath, "utf-8");
          result += `\n\n--- ${path.basename(resourcePath)} ---\n${resourceContent}`;
        } catch {
          // Skip unreadable resources
        }
      }
    }

    return result;
  }
}

export const browserSkillLoader = new BrowserSkillLoaderService();
