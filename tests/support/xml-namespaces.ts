// happy-dom parses XML but does not resolve attribute namespaces (`getAttributeNS` always returns null), unlike every browser.
// This gives it the browser behavior for prefixed attributes, so the TTML parser is tested as it runs in production.

function namespaceOfPrefix(el: Element, prefix: string): string | null {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const declared = node.getAttribute(`xmlns:${prefix}`);
    if (declared !== null) return declared;
  }
  return null;
}

export function installAttributeNamespaces(): void {
  Element.prototype.getAttributeNS = function (
    this: Element,
    namespace: string | null,
    local: string,
  ) {
    for (const attr of Array.from(this.attributes)) {
      const [prefix, name] = attr.name.includes(':') ? attr.name.split(':') : [null, attr.name];
      if (name !== local) continue;
      const resolved = prefix ? namespaceOfPrefix(this, prefix) : null;
      if (resolved === namespace) return attr.value;
    }
    return null;
  };
}
