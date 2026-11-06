export class DOM {
  static select<T extends HTMLElement>(
    selector: string,
    context: Document | HTMLElement = document,
  ): T {
    const element = context.querySelector<T>(selector);
    if (!element) {
      throw new Error(`DOM Error: Element '${selector}' not found.`);
    }
    return element;
  }

  static selectAll<T extends HTMLElement>(
    selector: string,
    context: Document | HTMLElement = document,
  ): T[] {
    return Array.from(context.querySelectorAll<T>(selector));
  }

  static create<T extends HTMLElement>(
    tag: string,
    className?: string,
    innerHTML?: string,
  ): T {
    const element = document.createElement(tag) as T;
    if (className) element.className = className;
    if (innerHTML) element.innerHTML = innerHTML;
    return element;
  }
}
