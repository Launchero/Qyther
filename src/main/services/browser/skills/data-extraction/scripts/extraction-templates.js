// Extract all visible text content from the page
() => {
  return document.body.innerText;
}

---

// Extract all links with text and URL
() => {
  const links = Array.from(document.querySelectorAll('a[href]'));
  return links.map(a => ({
    text: a.innerText.trim(),
    href: a.href,
  })).filter(l => l.href.startsWith('http'));
}

---

// Extract all images with alt text
() => {
  const images = Array.from(document.querySelectorAll('img'));
  return images.map(img => ({
    src: img.src,
    alt: img.alt || '',
    width: img.naturalWidth,
    height: img.naturalHeight,
  }));
}

---

// Extract table data as structured array
() => {
  const tables = Array.from(document.querySelectorAll('table'));
  return tables.map(table => {
    const rows = Array.from(table.querySelectorAll('tr'));
    return rows.map(row => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      return cells.map(cell => cell.innerText.trim());
    });
  });
}

---

// Extract meta tags (Open Graph, Twitter Card, etc.)
() => {
  const metas = Array.from(document.querySelectorAll('meta[property], meta[name]'));
  const result = {};
  metas.forEach(meta => {
    const key = meta.getAttribute('property') || meta.getAttribute('name');
    const value = meta.getAttribute('content');
    if (key && value) result[key] = value;
  });
  return result;
}

---

// Extract structured data (JSON-LD)
() => {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  return scripts.map(s => {
    try {
      return JSON.parse(s.textContent);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

---

// Extract all form fields with current values
() => {
  const fields = Array.from(document.querySelectorAll('input, select, textarea'));
  return fields.map(f => ({
    tag: f.tagName.toLowerCase(),
    type: f.type || null,
    name: f.name || null,
    id: f.id || null,
    value: f.value || null,
    placeholder: f.placeholder || null,
    required: f.required || false,
    disabled: f.disabled || false,
  }));
}

---

// Extract prices from the page (common pattern for e-commerce)
() => {
  const priceRegex = /\$[\d,]+\.?\d*/;
  const text = document.body.innerText;
  const matches = text.match(priceRegex) || [];
  return [...new Set(matches)]; // Remove duplicates
}

---

// Extract all headings with hierarchy
() => {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  return headings.map(h => ({
    level: parseInt(h.tagName[1]),
    text: h.innerText.trim(),
  }));
}
