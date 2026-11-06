export type ElementReference = string | HTMLElement;
export type ElementsReference = string | HTMLElement | NodeListOf<HTMLElement> | HTMLElement[];
export type ResolvedElements = Record<string, HTMLElement | HTMLElement[] | null>;

export interface ComponentOptions {
  element: ElementReference;
  elements?: Record<string, ElementsReference>;
}

export class Component {
  protected element!: HTMLElement;
  protected elements: ResolvedElements = {};
  private readonly elementReference: ElementReference;
  private readonly elementsReferences: Record<string, ElementsReference>;
  private lifecycleController: AbortController | null = null;
  private created = false;

  constructor({ element, elements = {} }: ComponentOptions) {
    this.elementReference = element;
    this.elementsReferences = elements;
  }

  create(root: ParentNode = document): void {
    if (this.created) this.destroy();

    this.element = this.resolveElement(this.elementReference, root);
    this.elements = Object.fromEntries(
      Object.entries(this.elementsReferences).map(([key, reference]) => [
        key,
        this.resolveElements(reference),
      ]),
    );
    this.lifecycleController = new AbortController();
    this.created = true;
    this.onCreate();
    this.addEventListeners();
  }

  destroy(): void {
    if (!this.created) return;
    this.removeEventListeners();
    this.lifecycleController?.abort();
    this.lifecycleController = null;
    this.onDestroy();
    this.elements = {};
    this.created = false;
  }

  protected get isCreated(): boolean {
    return this.created;
  }

  protected get signal(): AbortSignal {
    if (!this.lifecycleController) {
      throw new Error('Component lifecycle is inactive. Call create() first.');
    }
    return this.lifecycleController.signal;
  }

  protected select<T extends HTMLElement>(selector: string): T {
    const element = this.element.querySelector<T>(selector);
    if (!element) throw new Error(`Component element '${selector}' was not found.`);
    return element;
  }

  protected selectAll<T extends HTMLElement>(selector: string): T[] {
    return Array.from(this.element.querySelectorAll<T>(selector));
  }

  protected listen(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options: Omit<AddEventListenerOptions, 'signal'> = {},
  ): void {
    target.addEventListener(type, listener, { ...options, signal: this.signal });
  }

  protected onCreate(): void {}
  protected onDestroy(): void {}
  protected addEventListeners(): void {}
  protected removeEventListeners(): void {}

  private resolveElement(reference: ElementReference, root: ParentNode): HTMLElement {
    if (reference instanceof HTMLElement) return reference;
    const element = root.querySelector<HTMLElement>(reference);
    if (!element) throw new Error(`Component root '${reference}' was not found.`);
    return element;
  }

  private resolveElements(reference: ElementsReference): HTMLElement | HTMLElement[] | null {
    if (reference instanceof HTMLElement) return reference;
    if (typeof reference === 'string') {
      const matches = Array.from(this.element.querySelectorAll<HTMLElement>(reference));
      if (matches.length === 0) return null;
      return matches.length === 1 ? matches[0] ?? null : matches;
    }
    return Array.from(reference);
  }
}
