/**
 * Transforms kebob case strings to camel case strings
 * @example
 * // returns 'myKebobCase'
 * kebobToCamelCase('my-kebob-case');
 * @param {string} _string - the kebob-case string to transform to camelCase
 * @returns {string}
 */
const kebobToCamelCase = (_string) => {
  // eslint-disable-next-line no-useless-escape
  return _string.replace(/(\-\w)/g, (word) => word[1].toUpperCase());
};

/**
 * Converts string boolean values to true booleans.
 * @param {string} value - the value to check its truthy
 * @param {string} attributeName - (optional) the elements attribute name to be compared with value
 * @return void
 */
const coerceBooleanValue = (value, attributeName) => {
  return (
    String(value) === 'true' || String(value) === '' || value === attributeName
  );
};

const renderSymbol = Symbol();
const stylesMap = new Map();
class MagicElectronBase extends HTMLElement {
  /**
   * Set initial value for boundAttributes
   * to bind attributes and properties together
   */
  static get boundAttributes() {
    return [];
  }

  /** Set default observed attributes to include boundAttributes */
  static get observedAttributes() {
    return [...this.boundAttributes];
  }

  /** Specify boolean attributes */
  static get booleanAttributes() {
    return [];
  }
  /**
   *
   * @param {Boolean} shadowRoot
   */
  constructor(shadowRoot = true) {
    super();
    if (shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    const styleSheets = stylesMap.get(this.tagName);
    const { styles } = this.constructor;
    if (styles && !styleSheets) {
      stylesMap.set(
        this.tagName,
        styles.map((styleText) => {
          if ('adoptedStyleSheets' in document) {
            const styleSheet = new CSSStyleSheet();
            styleSheet.replace(styleText);
            return styleSheet;
          } else {
            return `<style>${styleText}</style>`;
          }
        })
      );
    }
    this.updatedCallbacksMap = new Map();
    /** Bind bound attribute keys to element properties */
    this.constructor.boundAttributes.forEach((attribute) => {
      const property = kebobToCamelCase(attribute);

      Object.defineProperty(this, property, {
        get: () => {
          const value = this.getAttribute(attribute);
          if (this.constructor.booleanAttributes.includes(attribute)) {
            if (!value) {
              return false;
            } else {
              return true;
            }
          }
          return value;
        },
        set: (value) => {
          /** Do we need to fire the udpatedCallback? */
          const callbackNeeded = value === this[property];

          if (this.constructor.booleanAttributes.includes(attribute)) {
            if (value || value === '') {
              this.setAttribute(attribute, true);
            } else {
              this.removeAttribute(attribute);
            }
          } else {
            if (value) {
              this.setAttribute(attribute, value);
            } else {
              this.removeAttribute(attribute);
            }
          }

          /**
           * If an updated callback exists for this attribute,
           * call it from this call site
           */
          const updatedCallback = this.updatedCallbacksMap.get(attribute);
          if (
            updatedCallback &&
            typeof updatedCallback === 'function' &&
            callbackNeeded
          ) {
            updatedCallback.apply(this, [value, attribute]);
          }
        },
      });
    });
    /** Listeners */
    this._listeners = new Map();

    /** Refs */
    this.refs = {};

    /** Create a unique ID */
    // eslint-disable-next-line no-useless-escape
    this._uid = btoa(Math.floor(Math.random() * 1000000)).replace(/\=/gi, '');

    /** Save html */
    this[renderSymbol] = false;
  }

  /**
   * Attaches a click event handler if disabled is present. Ensures disabled components cannot emit click events
   * @return void
   */
  attachDisabledClickEventHandler() {
    if (this.constructor.observedAttributes.includes('disabled')) {
      this.on(
        'click',
        (event) => {
          if (this.disabled) {
            event.stopImmediatePropagation();
          }
        },
        true
      );
    }
  }

  /** Bind new attribute value to prop value for bound attributes */
  attributeChangedCallback(name, oldValue, newValue) {
    const property = kebobToCamelCase(name);
    let key = name;

    if (property !== name) {
      key = property;
    }

    if (
      newValue !== oldValue &&
      this.constructor.boundAttributes.includes(name)
    ) {
      // coerce the string values from strings to booleans
      if (this.constructor.booleanAttributes.includes(name)) {
        newValue = coerceBooleanValue(newValue, name);
        oldValue = coerceBooleanValue(oldValue, name);
      }

      if (
        newValue !== '' ||
        !this.constructor.booleanAttributes.includes(name)
      ) {
        this[key] = newValue;
      } else if (newValue === '' && this.hasAttribute(name)) {
        this[key] = true;
      } else if (!this.hasAttribute(name)) {
        this[key] = null;
      }
    }
  }

  /**
   * Bind method to this instance
   * @param {string} methodName
   * @return void
   */
  bindMethod(methodName) {
    this[methodName] = this[methodName].bind(this);
  }

  /**
   * Set up bindings
   * @param {Array<string>} methods - method names to bind
   * @return void
   */
  bindMethods(methods = []) {
    methods.forEach((method) => (this[method] = this[method].bind(this)));
  }
  /**
   * set what should be called when attribute changes.
   * @param {String} refString refs name
   * @param {Function} callback Callback for the attribute change
   */
  boundAttributeCallback(refString, callback) {
    this.updatedCallbacksMap.set(refString, callback);
  }
  /**
   * build the ref map.
   */
  buildRefs() {
    if (this.root) {
      this.root.querySelectorAll('[data-ref]').forEach((ref) => {
        this.refs[ref.dataset.ref] = ref;
      });
    }
  }
  /** Default connectedCallback */
  connectedCallback() {
    /** Save a reference to primary content as this.root */
    if (this.shadowRoot) {
      this.root = this.shadowRoot;
    } else {
      this.root = this;
    }

    /** Add styleSheets if possible */
    if (stylesMap.get(this.tagName) && 'adoptedStyleSheets' in document) {
      if (this.shadowRoot) {
        this.shadowRoot.adoptedStyleSheets = stylesMap.get(this.tagName);
      }
    }

    this.render();
    this.connected();
    this.upgradeProperties();
    this.attachDisabledClickEventHandler();
  }

  /** Default disconnectedCallback */
  disconnectedCallback() {
    this._listeners.forEach((callback, eventName) =>
      this.removeEventListener(eventName, callback)
    );
    this.disconnected();
  }

  /**
   * Construct and dispatch a new CustomEvent
   * that is composed (traverses shadow boundary)
   * and that bubbles
   * @param {string} name - Event name to emit
   * @param {any} detail - The detail property of the CustomEvent
   * @return void
   */
  emitEvent(name, detail) {
    const customEvent = new CustomEvent(name, {
      detail,
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(customEvent);
  }
  htmlLitStyle(data) {
    if (!('adoptedStyleSheets' in document) && stylesMap.get(this.tagName)) {
      return stylesMap.get(this.tagName).join('') + data;
    }
    return data;
  }
  /**
   * Perform an action on event bubbling to this
   * @param {string} eventName
   * @param {function} callback
   * @return void
   */
  on(eventName, callback, options) {
    this._listeners.set(eventName, callback);
    this.addEventListener(eventName, callback, options);
  }
  /**
   * Rerender the html
   */
  rerender() {
    this[renderSymbol] = false;
    this.render();
  }

  /**
   * Reinitialize property now that the component is `alive` so that it can receive the set values.
   * @param {string} prop
   */
  upgradeProperty(prop) {
    // eslint-disable-next-line no-prototype-builtins
    if (this.hasOwnProperty(prop)) {
      let value = this[prop];
      delete this[prop];
      this[prop] = value;
    }
  }

  /**
   * This is a webcomponents best practice.
   * It captures the value from the unupgraded instance and reinitializes the property so it does not shadow the custom element's own property setter.
   * This way, when the element's definition does finally load, it can immediately reflect the correct state.
   */
  upgradeProperties() {
    this.constructor.observedAttributes.forEach((prop) => {
      // eslint-disable-next-line no-prototype-builtins
      if (this.hasOwnProperty(prop)) {
        let value = this[prop];
        if (value) {
          this[prop] = value;
        }
      }
    });
  }

  /** Default methods so we don't need checks */
  connected() {}
  disconnected() {}
  render() {}
  postRender() {}
}

const defineElement = (tagName, elementClass, config) => {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, elementClass, config);
  } else {
    console.warn(`${tagName} has already been define.`);
  }
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const directives = new WeakMap();
/**
 * Brands a function as a directive factory function so that lit-html will call
 * the function during template rendering, rather than passing as a value.
 *
 * A _directive_ is a function that takes a Part as an argument. It has the
 * signature: `(part: Part) => void`.
 *
 * A directive _factory_ is a function that takes arguments for data and
 * configuration and returns a directive. Users of directive usually refer to
 * the directive factory as the directive. For example, "The repeat directive".
 *
 * Usually a template author will invoke a directive factory in their template
 * with relevant arguments, which will then return a directive function.
 *
 * Here's an example of using the `repeat()` directive factory that takes an
 * array and a function to render an item:
 *
 * ```js
 * html`<ul><${repeat(items, (item) => html`<li>${item}</li>`)}</ul>`
 * ```
 *
 * When `repeat` is invoked, it returns a directive function that closes over
 * `items` and the template function. When the outer template is rendered, the
 * return directive function is called with the Part for the expression.
 * `repeat` then performs it's custom logic to render multiple items.
 *
 * @param f The directive factory function. Must be a function that returns a
 * function of the signature `(part: Part) => void`. The returned function will
 * be called with the part object.
 *
 * @example
 *
 * import {directive, html} from 'lit-html';
 *
 * const immutable = directive((v) => (part) => {
 *   if (part.value !== v) {
 *     part.setValue(v)
 *   }
 * });
 */
const directive = (f) => ((...args) => {
    const d = f(...args);
    directives.set(d, true);
    return d;
});
const isDirective = (o) => {
    return typeof o === 'function' && directives.has(o);
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * True if the custom elements polyfill is in use.
 */
const isCEPolyfill = typeof window !== 'undefined' &&
    window.customElements != null &&
    window.customElements.polyfillWrapFlushCallback !==
        undefined;
/**
 * Removes nodes, starting from `start` (inclusive) to `end` (exclusive), from
 * `container`.
 */
const removeNodes = (container, start, end = null) => {
    while (start !== end) {
        const n = start.nextSibling;
        container.removeChild(start);
        start = n;
    }
};

/**
 * @license
 * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * A sentinel value that signals that a value was handled by a directive and
 * should not be written to the DOM.
 */
const noChange = {};
/**
 * A sentinel value that signals a NodePart to fully clear its content.
 */
const nothing = {};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * An expression marker with embedded unique key to avoid collision with
 * possible text in templates.
 */
const marker = `{{lit-${String(Math.random()).slice(2)}}}`;
/**
 * An expression marker used text-positions, multi-binding attributes, and
 * attributes with markup-like text values.
 */
const nodeMarker = `<!--${marker}-->`;
const markerRegex = new RegExp(`${marker}|${nodeMarker}`);
/**
 * Suffix appended to all bound attribute names.
 */
const boundAttributeSuffix = '$lit$';
/**
 * An updatable Template that tracks the location of dynamic parts.
 */
class Template {
    constructor(result, element) {
        this.parts = [];
        this.element = element;
        const nodesToRemove = [];
        const stack = [];
        // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
        const walker = document.createTreeWalker(element.content, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
        // Keeps track of the last index associated with a part. We try to delete
        // unnecessary nodes, but we never want to associate two different parts
        // to the same index. They must have a constant node between.
        let lastPartIndex = 0;
        let index = -1;
        let partIndex = 0;
        const { strings, values: { length } } = result;
        while (partIndex < length) {
            const node = walker.nextNode();
            if (node === null) {
                // We've exhausted the content inside a nested template element.
                // Because we still have parts (the outer for-loop), we know:
                // - There is a template in the stack
                // - The walker will find a nextNode outside the template
                walker.currentNode = stack.pop();
                continue;
            }
            index++;
            if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
                if (node.hasAttributes()) {
                    const attributes = node.attributes;
                    const { length } = attributes;
                    // Per
                    // https://developer.mozilla.org/en-US/docs/Web/API/NamedNodeMap,
                    // attributes are not guaranteed to be returned in document order.
                    // In particular, Edge/IE can return them out of order, so we cannot
                    // assume a correspondence between part index and attribute index.
                    let count = 0;
                    for (let i = 0; i < length; i++) {
                        if (endsWith(attributes[i].name, boundAttributeSuffix)) {
                            count++;
                        }
                    }
                    while (count-- > 0) {
                        // Get the template literal section leading up to the first
                        // expression in this attribute
                        const stringForPart = strings[partIndex];
                        // Find the attribute name
                        const name = lastAttributeNameRegex.exec(stringForPart)[2];
                        // Find the corresponding attribute
                        // All bound attributes have had a suffix added in
                        // TemplateResult#getHTML to opt out of special attribute
                        // handling. To look up the attribute value we also need to add
                        // the suffix.
                        const attributeLookupName = name.toLowerCase() + boundAttributeSuffix;
                        const attributeValue = node.getAttribute(attributeLookupName);
                        node.removeAttribute(attributeLookupName);
                        const statics = attributeValue.split(markerRegex);
                        this.parts.push({ type: 'attribute', index, name, strings: statics });
                        partIndex += statics.length - 1;
                    }
                }
                if (node.tagName === 'TEMPLATE') {
                    stack.push(node);
                    walker.currentNode = node.content;
                }
            }
            else if (node.nodeType === 3 /* Node.TEXT_NODE */) {
                const data = node.data;
                if (data.indexOf(marker) >= 0) {
                    const parent = node.parentNode;
                    const strings = data.split(markerRegex);
                    const lastIndex = strings.length - 1;
                    // Generate a new text node for each literal section
                    // These nodes are also used as the markers for node parts
                    for (let i = 0; i < lastIndex; i++) {
                        let insert;
                        let s = strings[i];
                        if (s === '') {
                            insert = createMarker();
                        }
                        else {
                            const match = lastAttributeNameRegex.exec(s);
                            if (match !== null && endsWith(match[2], boundAttributeSuffix)) {
                                s = s.slice(0, match.index) + match[1] +
                                    match[2].slice(0, -boundAttributeSuffix.length) + match[3];
                            }
                            insert = document.createTextNode(s);
                        }
                        parent.insertBefore(insert, node);
                        this.parts.push({ type: 'node', index: ++index });
                    }
                    // If there's no text, we must insert a comment to mark our place.
                    // Else, we can trust it will stick around after cloning.
                    if (strings[lastIndex] === '') {
                        parent.insertBefore(createMarker(), node);
                        nodesToRemove.push(node);
                    }
                    else {
                        node.data = strings[lastIndex];
                    }
                    // We have a part for each match found
                    partIndex += lastIndex;
                }
            }
            else if (node.nodeType === 8 /* Node.COMMENT_NODE */) {
                if (node.data === marker) {
                    const parent = node.parentNode;
                    // Add a new marker node to be the startNode of the Part if any of
                    // the following are true:
                    //  * We don't have a previousSibling
                    //  * The previousSibling is already the start of a previous part
                    if (node.previousSibling === null || index === lastPartIndex) {
                        index++;
                        parent.insertBefore(createMarker(), node);
                    }
                    lastPartIndex = index;
                    this.parts.push({ type: 'node', index });
                    // If we don't have a nextSibling, keep this node so we have an end.
                    // Else, we can remove it to save future costs.
                    if (node.nextSibling === null) {
                        node.data = '';
                    }
                    else {
                        nodesToRemove.push(node);
                        index--;
                    }
                    partIndex++;
                }
                else {
                    let i = -1;
                    while ((i = node.data.indexOf(marker, i + 1)) !== -1) {
                        // Comment node has a binding marker inside, make an inactive part
                        // The binding won't work, but subsequent bindings will
                        // TODO (justinfagnani): consider whether it's even worth it to
                        // make bindings in comments work
                        this.parts.push({ type: 'node', index: -1 });
                        partIndex++;
                    }
                }
            }
        }
        // Remove text binding nodes after the walk to not disturb the TreeWalker
        for (const n of nodesToRemove) {
            n.parentNode.removeChild(n);
        }
    }
}
const endsWith = (str, suffix) => {
    const index = str.length - suffix.length;
    return index >= 0 && str.slice(index) === suffix;
};
const isTemplatePartActive = (part) => part.index !== -1;
// Allows `document.createComment('')` to be renamed for a
// small manual size-savings.
const createMarker = () => document.createComment('');
/**
 * This regex extracts the attribute name preceding an attribute-position
 * expression. It does this by matching the syntax allowed for attributes
 * against the string literal directly preceding the expression, assuming that
 * the expression is in an attribute-value position.
 *
 * See attributes in the HTML spec:
 * https://www.w3.org/TR/html5/syntax.html#elements-attributes
 *
 * " \x09\x0a\x0c\x0d" are HTML space characters:
 * https://www.w3.org/TR/html5/infrastructure.html#space-characters
 *
 * "\0-\x1F\x7F-\x9F" are Unicode control characters, which includes every
 * space character except " ".
 *
 * So an attribute is:
 *  * The name: any character except a control character, space character, ('),
 *    ("), ">", "=", or "/"
 *  * Followed by zero or more space characters
 *  * Followed by "="
 *  * Followed by zero or more space characters
 *  * Followed by:
 *    * Any character except space, ('), ("), "<", ">", "=", (`), or
 *    * (") then any non-("), or
 *    * (') then any non-(')
 */
const lastAttributeNameRegex = 
// eslint-disable-next-line no-control-regex
/([ \x09\x0a\x0c\x0d])([^\0-\x1F\x7F-\x9F "'>=/]+)([ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*))$/;

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * An instance of a `Template` that can be attached to the DOM and updated
 * with new values.
 */
class TemplateInstance {
    constructor(template, processor, options) {
        this.__parts = [];
        this.template = template;
        this.processor = processor;
        this.options = options;
    }
    update(values) {
        let i = 0;
        for (const part of this.__parts) {
            if (part !== undefined) {
                part.setValue(values[i]);
            }
            i++;
        }
        for (const part of this.__parts) {
            if (part !== undefined) {
                part.commit();
            }
        }
    }
    _clone() {
        // There are a number of steps in the lifecycle of a template instance's
        // DOM fragment:
        //  1. Clone - create the instance fragment
        //  2. Adopt - adopt into the main document
        //  3. Process - find part markers and create parts
        //  4. Upgrade - upgrade custom elements
        //  5. Update - set node, attribute, property, etc., values
        //  6. Connect - connect to the document. Optional and outside of this
        //     method.
        //
        // We have a few constraints on the ordering of these steps:
        //  * We need to upgrade before updating, so that property values will pass
        //    through any property setters.
        //  * We would like to process before upgrading so that we're sure that the
        //    cloned fragment is inert and not disturbed by self-modifying DOM.
        //  * We want custom elements to upgrade even in disconnected fragments.
        //
        // Given these constraints, with full custom elements support we would
        // prefer the order: Clone, Process, Adopt, Upgrade, Update, Connect
        //
        // But Safari does not implement CustomElementRegistry#upgrade, so we
        // can not implement that order and still have upgrade-before-update and
        // upgrade disconnected fragments. So we instead sacrifice the
        // process-before-upgrade constraint, since in Custom Elements v1 elements
        // must not modify their light DOM in the constructor. We still have issues
        // when co-existing with CEv0 elements like Polymer 1, and with polyfills
        // that don't strictly adhere to the no-modification rule because shadow
        // DOM, which may be created in the constructor, is emulated by being placed
        // in the light DOM.
        //
        // The resulting order is on native is: Clone, Adopt, Upgrade, Process,
        // Update, Connect. document.importNode() performs Clone, Adopt, and Upgrade
        // in one step.
        //
        // The Custom Elements v1 polyfill supports upgrade(), so the order when
        // polyfilled is the more ideal: Clone, Process, Adopt, Upgrade, Update,
        // Connect.
        const fragment = isCEPolyfill ?
            this.template.element.content.cloneNode(true) :
            document.importNode(this.template.element.content, true);
        const stack = [];
        const parts = this.template.parts;
        // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
        const walker = document.createTreeWalker(fragment, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
        let partIndex = 0;
        let nodeIndex = 0;
        let part;
        let node = walker.nextNode();
        // Loop through all the nodes and parts of a template
        while (partIndex < parts.length) {
            part = parts[partIndex];
            if (!isTemplatePartActive(part)) {
                this.__parts.push(undefined);
                partIndex++;
                continue;
            }
            // Progress the tree walker until we find our next part's node.
            // Note that multiple parts may share the same node (attribute parts
            // on a single element), so this loop may not run at all.
            while (nodeIndex < part.index) {
                nodeIndex++;
                if (node.nodeName === 'TEMPLATE') {
                    stack.push(node);
                    walker.currentNode = node.content;
                }
                if ((node = walker.nextNode()) === null) {
                    // We've exhausted the content inside a nested template element.
                    // Because we still have parts (the outer for-loop), we know:
                    // - There is a template in the stack
                    // - The walker will find a nextNode outside the template
                    walker.currentNode = stack.pop();
                    node = walker.nextNode();
                }
            }
            // We've arrived at our part's node.
            if (part.type === 'node') {
                const part = this.processor.handleTextExpression(this.options);
                part.insertAfterNode(node.previousSibling);
                this.__parts.push(part);
            }
            else {
                this.__parts.push(...this.processor.handleAttributeExpressions(node, part.name, part.strings, this.options));
            }
            partIndex++;
        }
        if (isCEPolyfill) {
            document.adoptNode(fragment);
            customElements.upgrade(fragment);
        }
        return fragment;
    }
}

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const commentMarker = ` ${marker} `;
/**
 * The return type of `html`, which holds a Template and the values from
 * interpolated expressions.
 */
class TemplateResult {
    constructor(strings, values, type, processor) {
        this.strings = strings;
        this.values = values;
        this.type = type;
        this.processor = processor;
    }
    /**
     * Returns a string of HTML used to create a `<template>` element.
     */
    getHTML() {
        const l = this.strings.length - 1;
        let html = '';
        let isCommentBinding = false;
        for (let i = 0; i < l; i++) {
            const s = this.strings[i];
            // For each binding we want to determine the kind of marker to insert
            // into the template source before it's parsed by the browser's HTML
            // parser. The marker type is based on whether the expression is in an
            // attribute, text, or comment position.
            //   * For node-position bindings we insert a comment with the marker
            //     sentinel as its text content, like <!--{{lit-guid}}-->.
            //   * For attribute bindings we insert just the marker sentinel for the
            //     first binding, so that we support unquoted attribute bindings.
            //     Subsequent bindings can use a comment marker because multi-binding
            //     attributes must be quoted.
            //   * For comment bindings we insert just the marker sentinel so we don't
            //     close the comment.
            //
            // The following code scans the template source, but is *not* an HTML
            // parser. We don't need to track the tree structure of the HTML, only
            // whether a binding is inside a comment, and if not, if it appears to be
            // the first binding in an attribute.
            const commentOpen = s.lastIndexOf('<!--');
            // We're in comment position if we have a comment open with no following
            // comment close. Because <-- can appear in an attribute value there can
            // be false positives.
            isCommentBinding = (commentOpen > -1 || isCommentBinding) &&
                s.indexOf('-->', commentOpen + 1) === -1;
            // Check to see if we have an attribute-like sequence preceding the
            // expression. This can match "name=value" like structures in text,
            // comments, and attribute values, so there can be false-positives.
            const attributeMatch = lastAttributeNameRegex.exec(s);
            if (attributeMatch === null) {
                // We're only in this branch if we don't have a attribute-like
                // preceding sequence. For comments, this guards against unusual
                // attribute values like <div foo="<!--${'bar'}">. Cases like
                // <!-- foo=${'bar'}--> are handled correctly in the attribute branch
                // below.
                html += s + (isCommentBinding ? commentMarker : nodeMarker);
            }
            else {
                // For attributes we use just a marker sentinel, and also append a
                // $lit$ suffix to the name to opt-out of attribute-specific parsing
                // that IE and Edge do for style and certain SVG attributes.
                html += s.substr(0, attributeMatch.index) + attributeMatch[1] +
                    attributeMatch[2] + boundAttributeSuffix + attributeMatch[3] +
                    marker;
            }
        }
        html += this.strings[l];
        return html;
    }
    getTemplateElement() {
        const template = document.createElement('template');
        template.innerHTML = this.getHTML();
        return template;
    }
}

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const isPrimitive = (value) => {
    return (value === null ||
        !(typeof value === 'object' || typeof value === 'function'));
};
const isIterable = (value) => {
    return Array.isArray(value) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !!(value && value[Symbol.iterator]);
};
/**
 * Writes attribute values to the DOM for a group of AttributeParts bound to a
 * single attribute. The value is only set once even if there are multiple parts
 * for an attribute.
 */
class AttributeCommitter {
    constructor(element, name, strings) {
        this.dirty = true;
        this.element = element;
        this.name = name;
        this.strings = strings;
        this.parts = [];
        for (let i = 0; i < strings.length - 1; i++) {
            this.parts[i] = this._createPart();
        }
    }
    /**
     * Creates a single part. Override this to create a differnt type of part.
     */
    _createPart() {
        return new AttributePart(this);
    }
    _getValue() {
        const strings = this.strings;
        const l = strings.length - 1;
        let text = '';
        for (let i = 0; i < l; i++) {
            text += strings[i];
            const part = this.parts[i];
            if (part !== undefined) {
                const v = part.value;
                if (isPrimitive(v) || !isIterable(v)) {
                    text += typeof v === 'string' ? v : String(v);
                }
                else {
                    for (const t of v) {
                        text += typeof t === 'string' ? t : String(t);
                    }
                }
            }
        }
        text += strings[l];
        return text;
    }
    commit() {
        if (this.dirty) {
            this.dirty = false;
            this.element.setAttribute(this.name, this._getValue());
        }
    }
}
/**
 * A Part that controls all or part of an attribute value.
 */
class AttributePart {
    constructor(committer) {
        this.value = undefined;
        this.committer = committer;
    }
    setValue(value) {
        if (value !== noChange && (!isPrimitive(value) || value !== this.value)) {
            this.value = value;
            // If the value is a not a directive, dirty the committer so that it'll
            // call setAttribute. If the value is a directive, it'll dirty the
            // committer if it calls setValue().
            if (!isDirective(value)) {
                this.committer.dirty = true;
            }
        }
    }
    commit() {
        while (isDirective(this.value)) {
            const directive = this.value;
            this.value = noChange;
            directive(this);
        }
        if (this.value === noChange) {
            return;
        }
        this.committer.commit();
    }
}
/**
 * A Part that controls a location within a Node tree. Like a Range, NodePart
 * has start and end locations and can set and update the Nodes between those
 * locations.
 *
 * NodeParts support several value types: primitives, Nodes, TemplateResults,
 * as well as arrays and iterables of those types.
 */
class NodePart {
    constructor(options) {
        this.value = undefined;
        this.__pendingValue = undefined;
        this.options = options;
    }
    /**
     * Appends this part into a container.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    appendInto(container) {
        this.startNode = container.appendChild(createMarker());
        this.endNode = container.appendChild(createMarker());
    }
    /**
     * Inserts this part after the `ref` node (between `ref` and `ref`'s next
     * sibling). Both `ref` and its next sibling must be static, unchanging nodes
     * such as those that appear in a literal section of a template.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    insertAfterNode(ref) {
        this.startNode = ref;
        this.endNode = ref.nextSibling;
    }
    /**
     * Appends this part into a parent part.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    appendIntoPart(part) {
        part.__insert(this.startNode = createMarker());
        part.__insert(this.endNode = createMarker());
    }
    /**
     * Inserts this part after the `ref` part.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    insertAfterPart(ref) {
        ref.__insert(this.startNode = createMarker());
        this.endNode = ref.endNode;
        ref.endNode = this.startNode;
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        if (this.startNode.parentNode === null) {
            return;
        }
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        const value = this.__pendingValue;
        if (value === noChange) {
            return;
        }
        if (isPrimitive(value)) {
            if (value !== this.value) {
                this.__commitText(value);
            }
        }
        else if (value instanceof TemplateResult) {
            this.__commitTemplateResult(value);
        }
        else if (value instanceof Node) {
            this.__commitNode(value);
        }
        else if (isIterable(value)) {
            this.__commitIterable(value);
        }
        else if (value === nothing) {
            this.value = nothing;
            this.clear();
        }
        else {
            // Fallback, will render the string representation
            this.__commitText(value);
        }
    }
    __insert(node) {
        this.endNode.parentNode.insertBefore(node, this.endNode);
    }
    __commitNode(value) {
        if (this.value === value) {
            return;
        }
        this.clear();
        this.__insert(value);
        this.value = value;
    }
    __commitText(value) {
        const node = this.startNode.nextSibling;
        value = value == null ? '' : value;
        // If `value` isn't already a string, we explicitly convert it here in case
        // it can't be implicitly converted - i.e. it's a symbol.
        const valueAsString = typeof value === 'string' ? value : String(value);
        if (node === this.endNode.previousSibling &&
            node.nodeType === 3 /* Node.TEXT_NODE */) {
            // If we only have a single text node between the markers, we can just
            // set its value, rather than replacing it.
            // TODO(justinfagnani): Can we just check if this.value is primitive?
            node.data = valueAsString;
        }
        else {
            this.__commitNode(document.createTextNode(valueAsString));
        }
        this.value = value;
    }
    __commitTemplateResult(value) {
        const template = this.options.templateFactory(value);
        if (this.value instanceof TemplateInstance &&
            this.value.template === template) {
            this.value.update(value.values);
        }
        else {
            // Make sure we propagate the template processor from the TemplateResult
            // so that we use its syntax extension, etc. The template factory comes
            // from the render function options so that it can control template
            // caching and preprocessing.
            const instance = new TemplateInstance(template, value.processor, this.options);
            const fragment = instance._clone();
            instance.update(value.values);
            this.__commitNode(fragment);
            this.value = instance;
        }
    }
    __commitIterable(value) {
        // For an Iterable, we create a new InstancePart per item, then set its
        // value to the item. This is a little bit of overhead for every item in
        // an Iterable, but it lets us recurse easily and efficiently update Arrays
        // of TemplateResults that will be commonly returned from expressions like:
        // array.map((i) => html`${i}`), by reusing existing TemplateInstances.
        // If _value is an array, then the previous render was of an
        // iterable and _value will contain the NodeParts from the previous
        // render. If _value is not an array, clear this part and make a new
        // array for NodeParts.
        if (!Array.isArray(this.value)) {
            this.value = [];
            this.clear();
        }
        // Lets us keep track of how many items we stamped so we can clear leftover
        // items from a previous render
        const itemParts = this.value;
        let partIndex = 0;
        let itemPart;
        for (const item of value) {
            // Try to reuse an existing part
            itemPart = itemParts[partIndex];
            // If no existing part, create a new one
            if (itemPart === undefined) {
                itemPart = new NodePart(this.options);
                itemParts.push(itemPart);
                if (partIndex === 0) {
                    itemPart.appendIntoPart(this);
                }
                else {
                    itemPart.insertAfterPart(itemParts[partIndex - 1]);
                }
            }
            itemPart.setValue(item);
            itemPart.commit();
            partIndex++;
        }
        if (partIndex < itemParts.length) {
            // Truncate the parts array so _value reflects the current state
            itemParts.length = partIndex;
            this.clear(itemPart && itemPart.endNode);
        }
    }
    clear(startNode = this.startNode) {
        removeNodes(this.startNode.parentNode, startNode.nextSibling, this.endNode);
    }
}
/**
 * Implements a boolean attribute, roughly as defined in the HTML
 * specification.
 *
 * If the value is truthy, then the attribute is present with a value of
 * ''. If the value is falsey, the attribute is removed.
 */
class BooleanAttributePart {
    constructor(element, name, strings) {
        this.value = undefined;
        this.__pendingValue = undefined;
        if (strings.length !== 2 || strings[0] !== '' || strings[1] !== '') {
            throw new Error('Boolean attributes can only contain a single expression');
        }
        this.element = element;
        this.name = name;
        this.strings = strings;
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        if (this.__pendingValue === noChange) {
            return;
        }
        const value = !!this.__pendingValue;
        if (this.value !== value) {
            if (value) {
                this.element.setAttribute(this.name, '');
            }
            else {
                this.element.removeAttribute(this.name);
            }
            this.value = value;
        }
        this.__pendingValue = noChange;
    }
}
/**
 * Sets attribute values for PropertyParts, so that the value is only set once
 * even if there are multiple parts for a property.
 *
 * If an expression controls the whole property value, then the value is simply
 * assigned to the property under control. If there are string literals or
 * multiple expressions, then the strings are expressions are interpolated into
 * a string first.
 */
class PropertyCommitter extends AttributeCommitter {
    constructor(element, name, strings) {
        super(element, name, strings);
        this.single =
            (strings.length === 2 && strings[0] === '' && strings[1] === '');
    }
    _createPart() {
        return new PropertyPart(this);
    }
    _getValue() {
        if (this.single) {
            return this.parts[0].value;
        }
        return super._getValue();
    }
    commit() {
        if (this.dirty) {
            this.dirty = false;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.element[this.name] = this._getValue();
        }
    }
}
class PropertyPart extends AttributePart {
}
// Detect event listener options support. If the `capture` property is read
// from the options object, then options are supported. If not, then the third
// argument to add/removeEventListener is interpreted as the boolean capture
// value so we should only pass the `capture` property.
let eventOptionsSupported = false;
// Wrap into an IIFE because MS Edge <= v41 does not support having try/catch
// blocks right into the body of a module
(() => {
    try {
        const options = {
            get capture() {
                eventOptionsSupported = true;
                return false;
            }
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.addEventListener('test', options, options);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.removeEventListener('test', options, options);
    }
    catch (_e) {
        // event options not supported
    }
})();
class EventPart {
    constructor(element, eventName, eventContext) {
        this.value = undefined;
        this.__pendingValue = undefined;
        this.element = element;
        this.eventName = eventName;
        this.eventContext = eventContext;
        this.__boundHandleEvent = (e) => this.handleEvent(e);
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        if (this.__pendingValue === noChange) {
            return;
        }
        const newListener = this.__pendingValue;
        const oldListener = this.value;
        const shouldRemoveListener = newListener == null ||
            oldListener != null &&
                (newListener.capture !== oldListener.capture ||
                    newListener.once !== oldListener.once ||
                    newListener.passive !== oldListener.passive);
        const shouldAddListener = newListener != null && (oldListener == null || shouldRemoveListener);
        if (shouldRemoveListener) {
            this.element.removeEventListener(this.eventName, this.__boundHandleEvent, this.__options);
        }
        if (shouldAddListener) {
            this.__options = getOptions(newListener);
            this.element.addEventListener(this.eventName, this.__boundHandleEvent, this.__options);
        }
        this.value = newListener;
        this.__pendingValue = noChange;
    }
    handleEvent(event) {
        if (typeof this.value === 'function') {
            this.value.call(this.eventContext || this.element, event);
        }
        else {
            this.value.handleEvent(event);
        }
    }
}
// We copy options because of the inconsistent behavior of browsers when reading
// the third argument of add/removeEventListener. IE11 doesn't support options
// at all. Chrome 41 only reads `capture` if the argument is an object.
const getOptions = (o) => o &&
    (eventOptionsSupported ?
        { capture: o.capture, passive: o.passive, once: o.once } :
        o.capture);

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * Creates Parts when a template is instantiated.
 */
class DefaultTemplateProcessor {
    /**
     * Create parts for an attribute-position binding, given the event, attribute
     * name, and string literals.
     *
     * @param element The element containing the binding
     * @param name  The attribute name
     * @param strings The string literals. There are always at least two strings,
     *   event for fully-controlled bindings with a single expression.
     */
    handleAttributeExpressions(element, name, strings, options) {
        const prefix = name[0];
        if (prefix === '.') {
            const committer = new PropertyCommitter(element, name.slice(1), strings);
            return committer.parts;
        }
        if (prefix === '@') {
            return [new EventPart(element, name.slice(1), options.eventContext)];
        }
        if (prefix === '?') {
            return [new BooleanAttributePart(element, name.slice(1), strings)];
        }
        const committer = new AttributeCommitter(element, name, strings);
        return committer.parts;
    }
    /**
     * Create parts for a text-position binding.
     * @param templateFactory
     */
    handleTextExpression(options) {
        return new NodePart(options);
    }
}
const defaultTemplateProcessor = new DefaultTemplateProcessor();

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * The default TemplateFactory which caches Templates keyed on
 * result.type and result.strings.
 */
function templateFactory(result) {
    let templateCache = templateCaches.get(result.type);
    if (templateCache === undefined) {
        templateCache = {
            stringsArray: new WeakMap(),
            keyString: new Map()
        };
        templateCaches.set(result.type, templateCache);
    }
    let template = templateCache.stringsArray.get(result.strings);
    if (template !== undefined) {
        return template;
    }
    // If the TemplateStringsArray is new, generate a key from the strings
    // This key is shared between all templates with identical content
    const key = result.strings.join(marker);
    // Check if we already have a Template for this key
    template = templateCache.keyString.get(key);
    if (template === undefined) {
        // If we have not seen this key before, create a new Template
        template = new Template(result, result.getTemplateElement());
        // Cache the Template for this key
        templateCache.keyString.set(key, template);
    }
    // Cache all future queries for this TemplateStringsArray
    templateCache.stringsArray.set(result.strings, template);
    return template;
}
const templateCaches = new Map();

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const parts = new WeakMap();
/**
 * Renders a template result or other value to a container.
 *
 * To update a container with new values, reevaluate the template literal and
 * call `render` with the new result.
 *
 * @param result Any value renderable by NodePart - typically a TemplateResult
 *     created by evaluating a template tag like `html` or `svg`.
 * @param container A DOM parent to render to. The entire contents are either
 *     replaced, or efficiently updated if the same result type was previous
 *     rendered there.
 * @param options RenderOptions for the entire render tree rendered to this
 *     container. Render options must *not* change between renders to the same
 *     container, as those changes will not effect previously rendered DOM.
 */
const render = (result, container, options) => {
    let part = parts.get(container);
    if (part === undefined) {
        removeNodes(container, container.firstChild);
        parts.set(container, part = new NodePart(Object.assign({ templateFactory }, options)));
        part.appendInto(container);
    }
    part.setValue(result);
    part.commit();
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// IMPORTANT: do not change the property name or the assignment expression.
// This line will be used in regexes to search for lit-html usage.
// TODO(justinfagnani): inject version number at build time
if (typeof window !== 'undefined') {
    (window['litHtmlVersions'] || (window['litHtmlVersions'] = [])).push('1.2.1');
}
/**
 * Interprets a template literal as an HTML template that can efficiently
 * render to and update a container.
 */
const html = (strings, ...values) => new TemplateResult(strings, values, 'html', defaultTemplateProcessor);

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// For each part, remember the value that was last rendered to the part by the
// unsafeHTML directive, and the DocumentFragment that was last set as a value.
// The DocumentFragment is used as a unique key to check if the last value
// rendered to the part was with unsafeHTML. If not, we'll always re-render the
// value passed to unsafeHTML.
const previousValues = new WeakMap();
/**
 * Renders the result as HTML, rather than text.
 *
 * Note, this is unsafe to use with any user-provided input that hasn't been
 * sanitized or escaped, as it may lead to cross-site-scripting
 * vulnerabilities.
 */
const unsafeHTML = directive((value) => (part) => {
    if (!(part instanceof NodePart)) {
        throw new Error('unsafeHTML can only be used in text bindings');
    }
    const previousValue = previousValues.get(part);
    if (previousValue !== undefined && isPrimitive(value) &&
        value === previousValue.value && part.value === previousValue.fragment) {
        return;
    }
    const template = document.createElement('template');
    template.innerHTML = value; // innerHTML casts to string internally
    const fragment = document.importNode(template.content, true);
    part.setValue(fragment);
    previousValues.set(part, { value, fragment });
});

var css_248z = ".content{display:grid;grid-template-rows:96px 1fr auto;height:100%}.content .sink{margin:8px 16px}.content .sink .box{display:flex;justify-content:center}.content .sink .box .show{display:none}.content .sink .box .openClose{display:flex;width:100%;justify-content:space-between;align-items:center}.content .sink .box .openClose .svgDiv{display:flex;margin:0 0 0 8px}.content .sink .box .openClose .show{display:none}.content .sink .box .openClose svg{height:20px;width:20px;cursor:pointer}.content .sink .box .openClose .noShow{display:none}.content .sink squid-container{width:fit-content}.content .sink squid-container .container{display:grid;grid-template-columns:1fr;justify-items:center;padding:16px;background-color:#fff;grid-row-gap:8px}.content header{color:#fff;font-family:ZCOOL XiaoWei,serif;margin:8px;font-size:4rem;text-shadow:#8fb8dc 1px 2px 2px;display:flex;align-items:center}.content header .logoImage{width:90px;height:90px}.content footer{grid-row-start:-1;grid-row-end:-2;height:200px}";

/**
 * Returns an array of elements from parent.querySelectorAll
 * @param {HTMLElement} parent - The node to query from
 * @param {string} selector - The query selector
 * @return {Array<HTMLElement}
 */
const selectAll = (parent, selector) => {
  return Array.from(parent.querySelectorAll(selector));
};

/**
 * Converts string boolean values to true booleans.
 * @param {string} value - the value to check its truthy
 * @param {string} attributeName - (optional) the elements attribute name to be compared with value
 * @return void
 */
const coerceBooleanValue$1 = (value, attributeName) => {
  return (
    String(value) === 'true' || String(value) === '' || value === attributeName
  );
};

/**
 * Transforms kebob case strings to camel case strings
 * @example
 * // returns 'myKebobCase'
 * kebobToCamelCase('my-kebob-case');
 * @param {string} _string - the kebob-case string to transform to camelCase
 * @returns {string}
 */
const kebobToCamelCase$1 = _string => {
  // eslint-disable-next-line no-useless-escape
  return _string.replace(/(\-\w)/g, word => word[1].toUpperCase());
};

var supportsAdoptedStyleSheets = 'adoptedStyleSheets' in document;

const renderSymbol$1 = Symbol();
const stylesMap$1 = new Map();

class SquidBase extends HTMLElement {
  /**
   * Set initial value for boundAttributes
   * to bind attributes and properties together
   */
  static get boundAttributes() {
    return [];
  }

  /** Set default observed attributes to include boundAttributes */
  static get observedAttributes() {
    return [...this.boundAttributes];
  }

  /** Specify boolean attributes */
  static get booleanAttributes() {
    return [];
  }

  /**
   * @param {boolean} shadowRoot - Attach shadowRoot
   */
  constructor(shadowRoot = false) {
    super();

    if (shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }

    /** Styles */
    const styleSheets = stylesMap$1.get(this.tagName);
    const { styles } = this.constructor;
    if (styles && !styleSheets) {
      stylesMap$1.set(
        this.tagName,
        styles.map(styleText => {
          if (supportsAdoptedStyleSheets) {
            const styleSheet = new CSSStyleSheet();
            styleSheet.replace(styleText);
            return styleSheet;
          } else {
            return `<style>${styleText}</style>`;
          }
        })
      );
    }

    /** Additional actions during boundAttribute setters */
    this.updatedCallbacks = new Map();

    /** Bind bound attribute keys to element properties */
    this.constructor.boundAttributes.forEach(attribute => {
      const property = kebobToCamelCase$1(attribute);

      Object.defineProperty(this, property, {
        get: () => {
          const value = this.getAttribute(attribute);
          if (this.constructor.booleanAttributes.includes(attribute)) {
            if (!value) {
              return false;
            } else {
              return true;
            }
          }
          return value;
        },
        set: value => {
          /** Do we need to fire the udpatedCallback? */
          const callbackNeeded = value === this[property];

          if (this.constructor.booleanAttributes.includes(attribute)) {
            if (value || value === '') {
              this.setAttribute(attribute, true);
            } else {
              this.removeAttribute(attribute);
            }
          } else {
            if (value) {
              this.setAttribute(attribute, value);
            } else {
              this.removeAttribute(attribute);
            }
          }

          /**
           * If an updated callback exists for this attribute,
           * call it from this call site
           */
          const updatedCallback = this.updatedCallbacks.get(attribute);
          if (
            updatedCallback &&
            typeof updatedCallback === 'function' &&
            callbackNeeded
          ) {
            updatedCallback.apply(this, [value, attribute]);
          }
        },
      });
    });

    /** Listeners */
    this._listeners = new Map();

    /** Refs */
    this.refs = {};

    /** Create a unique ID */
    // eslint-disable-next-line no-useless-escape
    this._uid = btoa(Math.floor(Math.random() * 1000000)).replace(/\=/gi, '');

    /** Save html */
    this[renderSymbol$1] = false;
  }

  /**
   * Attaches a click event handler if disabled is present. Ensures disabled components cannot emit click events
   * @return void
   */
  attachDisabledClickEventHandler() {
    if (this.constructor.observedAttributes.includes('disabled')) {
      this.on(
        'click',
        event => {
          if (this.disabled) {
            event.stopImmediatePropagation();
          }
        },
        true
      );
    }
  }

  /** Bind new attribute value to prop value for bound attributes */
  attributeChangedCallback(name, oldValue, newValue) {
    const property = kebobToCamelCase$1(name);
    let key = name;

    if (property !== name) {
      key = property;
    }

    if (
      newValue !== oldValue &&
      this.constructor.boundAttributes.includes(name)
    ) {
      // coerce the string values from strings to booleans
      if (this.constructor.booleanAttributes.includes(name)) {
        newValue = coerceBooleanValue$1(newValue, name);
        oldValue = coerceBooleanValue$1(oldValue, name);
      }

      if (
        newValue !== '' ||
        !this.constructor.booleanAttributes.includes(name)
      ) {
        this[key] = newValue;
      } else if (newValue === '' && this.hasAttribute(name)) {
        this[key] = true;
      } else if (!this.hasAttribute(name)) {
        this[key] = null;
      }
    }
  }

  /**
   * Bind method to this instance
   * @param {string} methodName
   * @return void
   */
  bindMethod(methodName) {
    this[methodName] = this[methodName].bind(this);
  }

  /**
   * Set up bindings
   * @param {Array<string>} methods - method names to bind
   * @return void
   */
  bindMethods(methods = []) {
    methods.forEach(method => (this[method] = this[method].bind(this)));
  }

  /** Default connectedCallback */
  connectedCallback() {
    /** Save a reference to primary content as this.root */
    if (this.shadowRoot) {
      this.root = this.shadowRoot;
    } else {
      this.root = this;
    }

    /** Add styleSheets if possible */
    if (stylesMap$1.get(this.tagName) && supportsAdoptedStyleSheets) {
      if (this.shadowRoot) {
        this.shadowRoot.adoptedStyleSheets = stylesMap$1.get(this.tagName);
      }
    }

    this.render();
    this.connected();
    this.upgradeProperties();
    this.attachDisabledClickEventHandler();
  }

  /** Default disconnectedCallback */
  disconnectedCallback() {
    this._listeners.forEach((callback, eventName) =>
      this.removeEventListener(eventName, callback)
    );
    this.disconnected();
  }

  /**
   * Construct and dispatch a new CustomEvent
   * that is composed (traverses shadow boundary)
   * and that bubbles
   * @param {string} name - Event name to emit
   * @param {any} detail - The detail property of the CustomEvent
   * @return void
   */
  emitEvent(name, detail) {
    const customEvent = new CustomEvent(name, {
      detail,
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(customEvent);
  }

  /**
   * ES template tag used for parsing the
   * element's innerHTML. Use sparingly only
   * when you need a total rerender
   * @param {array<string>} strings
   * @param  {array<any>} values
   * @return void
   */
  html(strings, ...values) {
    if (!this[renderSymbol$1]) {
      let innerHTML = strings
        .map(
          (string, index) =>
            `${string ? string : ''}${
              values[index] !== undefined ? values[index] : ''
            }`
        )
        .join('');

      if (!supportsAdoptedStyleSheets && stylesMap$1.get(this.tagName)) {
        const styles = stylesMap$1.get(this.tagName).join('');
        innerHTML = `${styles}${innerHTML}`;
      }
      this.root.innerHTML = innerHTML;
      selectAll(this.root, '[data-ref]').forEach(
        ref => (this.refs[ref.dataset.ref] = ref)
      );
      this[renderSymbol$1] = true;
    }
    this.postRender();
  }

  /**
   * Perform an action on event bubbling to this
   * @param {string} eventName
   * @param {function} callback
   * @return void
   */
  on(eventName, callback, options) {
    this._listeners.set(eventName, callback);
    this.addEventListener(eventName, callback, options);
  }

  /**
   * Return any root element with [data-ref]
   * equal to the first argument
   * @param {string} ref
   * @return {HTMLElement}
   */
  ref(ref = '') {
    return this.root ? this.root.querySelector(`[data-ref="${ref}"]`) : null;
  }

  /**
   * Rerender the html
   */
  rerender() {
    this[renderSymbol$1] = false;
    this.render();
  }

  /**
   * Reinitialize property now that the component is `alive` so that it can receive the set values.
   * @param {string} prop
   */
  upgradeProperty(prop) {
    // eslint-disable-next-line no-prototype-builtins
    if (this.hasOwnProperty(prop)) {
      let value = this[prop];
      delete this[prop];
      this[prop] = value;
    }
  }

  /**
   * This is a webcomponents best practice.
   * It captures the value from the unupgraded instance and reinitializes the property so it does not shadow the custom element's own property setter.
   * This way, when the element's definition does finally load, it can immediately reflect the correct state.
   */
  upgradeProperties() {
    this.constructor.observedAttributes.forEach(prop => {
      // eslint-disable-next-line no-prototype-builtins
      if (this.hasOwnProperty(prop)) {
        let value = this[prop];
        if (value) {
          this[prop] = value;
        }
      }
    });
  }

  /** Default methods so we don't need checks */
  connected() {}
  disconnected() {}
  render() {}
  postRender() {}
}

/**
 * This function takes in a node and will
 * call itself recursively with the element's
 * parent node until a form `HTMLFormElement` is found
 * @param {HTMLElement} elem
 * @return {HTMLElement || null}
 */
const findParentForm = elem => {
  let parent = elem.parentNode;
  if (parent && parent.tagName !== 'FORM') {
    parent = findParentForm(parent);
  } else if (!parent && elem.toString() === '[object ShadowRoot]') {
    parent = findParentForm(elem.host);
  }
  return parent;
};

class SquidInputBase extends SquidBase {
  constructor(inputRef = 'input', helperRef = 'helpers') {
    super();
    this.attachShadow({ mode: 'open' });
    this._inputRef = inputRef;
    this._helperRef = helperRef;

    /** Set up listeners */
    this.bindMethods(['setHelper', 'setCustomValidity', '__onFormReset']);
    const { form } = this;
    this.on('keydown', event => {
      if (form && event.code === 'Enter') {
        form.dispatchEvent(new CustomEvent('submit'));
      }
    });

    if (form) {
      form.addEventListener('reset', this.__onFormReset);
    }
  }

  /** Proxy input checkValidity */
  get checkValidity() {
    const input = this.ref(this._inputRef);
    return input.checkValidity.bind(input);
  }

  /** Get the form. This should not be settable */
  get form() {
    this._form = this._form || findParentForm(this);
    return this._form;
  }

  /** Proxy input validity */
  get validity() {
    const input = this.ref(this._inputRef);
    return input ? input.validity : {};
  }

  /** Proxy input validationMessage */
  get validationMessage() {
    const input = this.ref(this._inputRef);
    return input ? input.validationMessage : null;
  }

  /** Proxy input willValidate */
  get willValidate() {
    const input = this.ref(this._inputRef);
    return input ? input.willValidate : null;
  }

  /** Proxy input blur */
  blur() {
    const input = this.ref(this._inputRef);
    input ? input.blur() : null;
  }

  /** Proxy input click */
  click() {
    const input = this.ref(this._inputRef);
    input ? input.click() : null;
  }

  /** Proxy input focus */
  focus() {
    const input = this.ref(this._inputRef);
    input ? input.focus() : null;
  }

  /**
   * Change the default error message
   * @param {string} key - The key of the error message
   * @param {string} message - The new error message
   * @return {string} - The new error message
   */
  setErrorMessage(key, message) {
    const helpers = this.ref(this._helperRef);
    return helpers
      ? this.ref(this._helperRef).setErrorMessage(key, message)
      : null;
  }

  /** Set custom validity */
  setCustomValidity(message = '') {
    const input = this.ref(this._inputRef);
    const helpers = this.ref(this._helperRef);
    if (!message) {
      message = '';
    }
    input ? input.setCustomValidity(message) : null;
    helpers ? helpers.setCustomError(message) : null;
  }

  /**
   * Set the element's helper text
   * @param {string} value - Helper text
   */
  setHelper(value) {
    if (this.ref(this._helperRef)) {
      this.ref(this._helperRef).setHelperText(value);
    }
  }

  /**
   * Reset the value when the form is reset
   */
  __onFormReset() {
    this.value = '';
  }
}

/**
 * Makes sure an element is defined only once
 * @param {String} tagName
 * @param {String} elementClass
 */
const defineSquidElement = (tagName, elementClass, config) => {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, elementClass, config);
  } else {
    console.warn(`${tagName} has already been defined.`);
  }
};

/**
 * Find a given node's shadow parent
 * @param {HTMLElement} node - The node to find the shadow root
 * @return {HTMLElement | false} - the parent shadow root
 */
const findShadowRoot = node => {
  let parent = node.parentNode;
  while (parent && parent.toString() !== '[object ShadowRoot]') {
    parent = parent.parentNode;
  }
  return parent;
};

var css = "";

class SquidCharacterCount extends SquidBase {
  static get styles() {
    return [css];
  }
  static get boundAttributes() {
    return ['id', 'max', 'count'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    /** Set up listeners */
    this.boundMethods = ['_setId', '_setMax', '_watchInput'];
    this.updatedCallbacks.set('id', this._setId);
    this.updatedCallbacks.set('max', this._setMax);
    this.updatedCallbacks.set('count', this._setCount);
  }

  render() {
    this
      .html`<span class="form-field--info" data-ref="counter" aria-live="polite">
      <span data-ref="count"></span>/<span data-ref="limit"></span>
    </span>`;
  }

  _initInput(input) {
    if (input) {
      this.count = input.value.length.toString();
      input.addEventListener('input', this._watchInput.bind(this));
      this.max = this.max || input.maxLength;
    }
  }

  _setCount(value) {
    const { count, counter } = this.refs;
    if (count) {
      count.innerHTML = value;
    }
    if (counter && +this.max > 0 && +value > +this.max) {
      counter.classList.add('form-field--info--error');
    } else if (counter) {
      counter.classList.remove('form-field--info--error');
    }
  }

  _setId(id) {
    const selector = `[aria-describedby~="${id}"]`;
    const parentHost = findShadowRoot(this);
    if (parentHost) {
      this.describes = parentHost.querySelector(selector);
      this._initInput(this.describes);
    } else {
      setTimeout(() => {
        this.describes = document.querySelector(selector);
        this._initInput(this.describes);
        this.count = this.describes
          ? this.describes.value.length.toString()
          : '0';
      });
    }
  }

  _setMax(max) {
    const { limit } = this.refs;
    if (limit) {
      limit.innerHTML = max;
    }
  }

  _watchInput(event) {
    this.count = event.target.value.length || '0';
  }
}
defineSquidElement('squid-character-count', SquidCharacterCount);

var css$1 = "";

class SquidErrors extends SquidBase {
  static get styles() {
    return [css$1];
  }
  static get boundAttributes() {
    return ['id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    /** Default validity messages intentionally newed up for each instance */
    this.validityMessages = new Map([
      ['customError', this._generateMessage(100, 'This field is invalid')],
      ['badInput', this._generateMessage(4, 'This field is invalid')],
      [
        'patternMismatch',
        this._generateMessage(
          9,
          'This field does not follow the proper pattern'
        ),
      ],
      [
        'rangeOverflow',
        this._generateMessage(
          8,
          'The value does not fit in the necessary range'
        ),
      ],
      [
        'stepMismatch',
        this._generateMessage(7, 'The value is not a valid step'),
      ],
      ['tooLong', this._generateMessage(6, 'The value is too long')],
      ['tooShort', this._generateMessage(6, 'The value is too short')],
      [
        'typeMismatch',
        this._generateMessage(5, 'The entered value is not the right format'),
      ],
      ['valueMissing', this._generateMessage(10, 'This field is required')],
    ]);

    /** Set up inputs array */
    this._inputs = [];

    /** Set up initial validators */
    this.validators = this.validators || [];

    /** Set up listeners */
    this.bindMethods([
      '_onIdChange',
      'handleChange',
      'handleReset',
      '_onDescribesInput',
      '_inputInvalid',
      '_inputValid',
    ]);

    /** Call method on bound attribute change */
    this.updatedCallbacks.set('id', this._onIdChange);
  }

  connected() {
    /** Initialize the element */
    this._onIdChange(this.id);
    this._addEventListeners();
    /** Append helper text */
    this.validityMessages.has('valid') &&
      this.appendHelper(this.validityMessages.get('valid'));
  }

  disconnected() {
    if (this.describes) {
      this.describes.removeEventListener('change', this.handleChange);
      this.describes.removeEventListener('input', this._onDescribesInput);
      this.describes.removeEventListener('blur', this.handleChange);
    } else if (this._inputs.length) {
      this._inputs.forEach(input => {
        input.removeEventListener('change', this.handleChange);
        input.removeEventListener('input', this._onDescribesInput);
        input.removeEventListener('blur', this.handleChange);
      });
    }
    this.form && this.form.removeEventListener('submit', this.handleChange);
    this._inputs.length = 0;
  }

  render() {
    this.html`<div class="helpers" data-ref="helpers"></div>`;
  }

  /**
   * Clear out the helpers and add the new one
   * based on priority
   * @param {object} helper - The helper object to render
   */
  appendHelper(helper) {
    /** Clear existing helpers */
    const { helpers } = this.refs;
    if (helpers) {
      helpers.innerHTML = '';
      if (helper && helper.message) {
        const helperEl = document.createElement('span');
        helperEl.classList.add(helper.type);
        helperEl.innerHTML = helper.message;
        helpers.appendChild(helperEl);
      }
    }
  }

  /**
   * Connect an input element
   * @param {HTMLInputElement} input
   */
  connectInput(input) {
    this._addEventListeners(input);
    this._inputs.push(input);
    if (input.type === 'radio') {
      this._invalidClass = 'radiobutton__input--error';
    }
    if (input.type === 'textarea') {
      this._invalidClass = 'textfield__input--error';
    }
  }

  /**
   * When the input changes display the appropriate errors
   * and manage accessibilit states
   * @param {Event} event - change event
   */
  handleChange(event = {}) {
    /** Prevent form submission if invalid */
    const describesInvalid =
      this.describes &&
      this.describes.validity &&
      this.describes.validity.valid === false;
    const inputsInvalid = describesInvalid;
    const isInvalid = describesInvalid || inputsInvalid;
    if (this.form === event.target && event.type === 'submit' && isInvalid) {
      event.preventDefault();
    }
    let validity = {};
    if (this.describes) {
      validity = this.describes.validity;
    } else if (this._inputs[0]) {
      validity = this._inputs[0].validity;
    }
    if (!validity) {
      validity = this._inputs[0].validity;
    }
    const validityKeys = [];
    this.validityMessages.forEach((value, key) => validityKeys.push(key));
    const helper = validityKeys
      .filter(errorKey => validity[errorKey])
      .map(errorKey => this.validityMessages.get(errorKey))
      .reduce((current, next) => {
        return current.priority > next.priority ? current : next;
      }, {});

    this.appendHelper(helper);

    if (this.describes) {
      if (validity.valid === false) {
        this._inputInvalid(this.describes);
      } else {
        this._inputValid(this.describes);
      }
    } else if (this._inputs.length) {
      if (validity.valid === false) {
        this._inputs.forEach(this._inputInvalid);
      } else {
        this._inputs.forEach(this._inputValid);
      }
    }
  }

  /**
   * Handle a form resetby clearing out helpers
   * and appending the helper text if available
   */
  handleReset() {
    const { helpers } = this.refs;
    const { describes } = this;
    if (helpers) {
      helpers.innerHTML = '';
      describes.classList.remove(this._invalidClass);
      if (this.validityMessages.get('valid')) {
        this.appendHelper(this.validityMessages.get('valid'));
      }
    }
  }

  /**
   * Sets a custom error message
   * @param {string} message - Validity message to display
   */
  setCustomError(message) {
    const customError = this.validityMessages.get('customError');
    customError ? (customError.message = message) : null;
    this.handleChange();
  }

  /**
   * Replace the default error message
   * @param {string} key - The key for validity messages
   * @param {*} message - The new message
   * @return {string} The updated message
   */
  setErrorMessage(key, message) {
    this.validityMessages.get(key).message = message;
    return this.validityMessages.get(key).message;
  }

  /**
   * Append the helper text to the element
   * @param {string} message
   */
  setHelperText(message) {
    this.validityMessages.set(
      'valid',
      this._generateMessage(10, message, 'helper')
    );
    const helper = this.validityMessages.get('valid');
    this.appendHelper(helper);
  }

  /** Initialize event listeners */
  _addEventListeners(input) {
    input = input || this.describes;
    if (input) {
      input.addEventListener('change', this.handleChange);
      input.addEventListener('blur', this.handleChange);
      input.addEventListener('input', this._onDescribesInput);
      if (this.form) {
        this.form.addEventListener('submit', this.handleChange, true);
        this.form.addEventListener('reset', this.handleReset, true);
      }
    }
  }

  /** Get the form. This should not be settable */
  get form() {
    this._form = this._form || findParentForm(this);
    return this._form;
  }

  /**
   * Set the input to show as invalid
   * @param {HTMLInputElement} input
   */
  _inputInvalid(input) {
    input.classList.add(this._invalidClass);
    input.setAttribute('aria-invalid', true);
  }

  /**
   * Set the input to show as valid
   * @param {HTMLInputElement} input
   */
  _inputValid(input) {
    input.classList.remove(this._invalidClass);
    input.setAttribute('aria-invalid', false);
  }

  /**
   * Watch for ID changes and keep the contents of this
   * errors element in sync with the new input
   * @param {string} value - The new id value
   */
  _onIdChange(value) {
    const selector = `[aria-describedby~="${value}"]`;

    if (this.parentNode && this.parentNode.host) {
      this.describes = this.parentNode.host.shadowRoot.querySelector(selector);
    } else if (this.parentNode) {
      this.describes = this.parentNode.querySelector(selector);
    }
    if (this.describes) {
      this._invalidClass =
        {
          checkbox: 'checkbox__input--error',
          textarea: 'textfield__textarea--error',
        }[this.describes.type] || 'textfield__input--error';

      if (this.describes.tagName === 'SELECT') {
        this._invalidClass = 'select__input--error';
      }

      if (this.describes.dataset.helperText) {
        this.setHelperText(this.describes.dataset.helperText);
      } else {
        setTimeout(() => {
          this.setHelperText(this.innerHTML);
        });
      }
    }
  }

  /**
   * Helper factory function
   * @param {number} priority - the importance of the helper
   * @param {string} message - the helper message
   * @param {string} type - the type of helper
   * @return {Helper}
   */
  _generateMessage(priority, message, type = 'error') {
    return { priority, message, type };
  }

  /**
   * Input input event watcher used to remove errors
   * when this.describes is altered
   */
  _onDescribesInput() {
    if (this.shadowRoot.querySelector('.error')) {
      this.appendHelper(this.validityMessages.get('valid'));
      if (this.describes) {
        this.describes.classList.remove(this._invalidClass);
      } else {
        this._inputs.forEach(input =>
          input.classList.remove(this._invalidClass)
        );
      }
    }
  }
}
class SquidHelpers extends SquidErrors {}
defineSquidElement('squid-errors', SquidErrors);
defineSquidElement('squid-helpers', SquidHelpers);

const INPUT_UPDATE = 'squid-change';
const ALERT_CLOSED = 'alert-closed';

var css$2 = "#container{display:flex;flex-direction:column;width:auto}#container squid-helpers{color:var(--red-default,red)}#container .label-wrapper{display:flex;justify-content:space-between;color:var(--dark-gray,#23282b);font-size:.75rem;opacity:.9;letter-spacing:.5px;margin-bottom:var(--padding-small,4px);position:relative;vertical-align:middle}#container label{text-transform:capitalize}#container input{border-radius:var(--radius-default,4px);background-image:none;box-shadow:none;font-size:1rem;height:var(--height-default,1rem);line-height:1.5;margin:0;padding:var(--padding-default,8px);border:2px solid var(--gray-default,#cfcccf);width:auto}#container input:disabled,#container input:read-only{cursor:not-allowed}#container input.textfield__input--error{border:2px solid var(--red-default,red)}";

class SquidInput extends SquidInputBase {
  static get styles() {
    return [css$2];
  }
  static get boundAttributes() {
    return [
      'disabled',
      'required',
      'minlength',
      'maxlength',
      'readonly',
      'autocomplete',
      'autofocus',
      'tooltip',
      'pattern',
      'min',
      'max',
      'value',
      'placeholder',
      'size',
      'compact',
      'helper',
      'error-message',
      'counter',
      'step',
    ];
  }
  static get booleanAttributes() {
    return [
      'disabled',
      'required',
      'readonly',
      'autofocus',
      'compact',
      'counter',
    ];
  }

  constructor(inputType = 'text') {
    super();
    this._inputType = inputType;

    /** Set up event listeners */
    this.bindMethods(['__onInputInput', '_linkInput', '_setCharacterCount']);
    this._inputAttributes = [
      'disabled',
      'required',
      'minlength',
      'maxlength',
      'readonly',
      'autocomplete',
      'autofocus',
      'pattern',
      'min',
      'max',
      'placeholder',
      'size',
      'step',
    ];

    /** Updated callbacks */
    this._inputAttributes.forEach(attribute => {
      this.updatedCallbacks.set(attribute, this._linkInput);
    });
    this.updatedCallbacks.set('value', this._setValue);
    this.updatedCallbacks.set('tooltip', this.setHelper);
    this.updatedCallbacks.set('compact', this._toggleInputClass);
    this.updatedCallbacks.set('helper', this.setHelper);
    this.updatedCallbacks.set('error-message', this.setCustomValidity);
    this.updatedCallbacks.set('counter', this._setCharacterCount);
  }

  connected() {
    const { input } = this.refs;
    input.addEventListener('input', this.__onInputInput);
    // Initialize input
    this._inputAttributes.forEach(attribute => {
      this[attribute] ? this._linkInput(this[attribute], attribute) : null;
    });
  }

  disconnected() {
    this.refs.input.removeEventListener('input', this.__onInputInput);
  }

  render() {
    this.html`<div id="container" data-ref="wrapper">
      <div class="label-wrapper">
        <label class="textfield__label" for="squid-input-${this._uid}" data-ref="label"><slot></slot></label>
        <squid-character-count data-ref="counter" id="counter-${this._uid}" hidden></squid-character-count>
      </div>
      <input class="textfield__input" type="${this._inputType}" name="squid-input" value="" id="squid-input-${this._uid}" data-ref="input" aria-describedby="helpers-${this._uid} counter-${this._uid}">
      <squid-helpers id="helpers-${this._uid}" data-ref="helpers"></squid-helpers>
    </div>`;
  }

  /**
   * Link input and `this` properties and values
   * @param {any} value - The new value for the property
   * @param {sring} prop - The property name to link between this and input
   */
  _linkInput(value, prop) {
    const { input, label } = this.refs;

    if (label) {
      if (prop === 'disabled' && value) {
        label.classList.add('disabled');
      } else if (prop === 'disabled' && !value) {
        label.classList.remove('disabled');
      }
    }

    if (input) {
      if (!value) {
        input.removeAttribute(prop);
      } else if (prop === 'minlength') {
        input.minLength = value;
      } else if (prop === 'maxlength') {
        input.maxLength = value;
      } else if (prop === 'readonly') {
        input.readOnly = value;
      } else {
        input[prop] = value;
      }
    }
  }

  _setCharacterCount(isVisible) {
    const { counter } = this.refs;
    if (counter && this.maxlength) {
      counter.hidden = !isVisible;
      Promise.resolve().then(() => (counter.max = this.maxlength));
    }
  }

  /**
   * Set the input's value and emit
   * and squid-change event
   * @param {string} _value - The new value
   */
  _setValue(_value) {
    const { input, counter } = this.refs;
    if (input && input.value !== _value) {
      input.value = _value;
    }
    if (this.counter && counter) {
      counter.count = (_value && _value.length) || '0';
    }
    this.emitEvent(INPUT_UPDATE, _value);
  }

  /**
   * Toggle a class on input
   * @param {boolean} value - set the class
   * @param {string} prop - class to set
   */
  _toggleInputClass(value, prop) {
    const { input } = this.refs;
    if (input) {
      input.classList.toggle(prop, value);
    }
  }

  /** Set the value every time an input event occurs */
  __onInputInput(event) {
    this.value = event.target.value;
  }
}
defineSquidElement('squid-input', SquidInput);

var css$3 = "button{border-radius:.25rem;box-sizing:border-box;cursor:pointer;display:inline-block;font-family:Roboto,Helvetica Neue,Helvetica,Arial,sans-serif;font-size:20px;font-weight:400;height:3rem;line-height:3rem;min-width:100%;text-align:center;text-decoration:none;white-space:nowrap;margin:0;padding:0 1rem;background:#0d74af;border:0;color:#fff}button slot.loading{display:none}button.small{min-width:auto;height:fit-content;padding:.25rem;font-size:.75rem;line-height:1rem}button:visited{color:#fff}button:hover{background:#0a5783}button:active,button:hover{color:#fff;text-decoration:none}button:active{background:#08486d}button:disabled{color:#c9ced2;background:#f2f3f4;border-color:#f2f3f4;cursor:not-allowed}button.left{background:transparent;font-size:1rem;line-height:3rem;height:auto;min-width:0;padding:0;color:#0d74af}button.left:hover{color:#0a5783;text-decoration:underline}button.left:active{color:#08486d;text-decoration:underline}button.left:disabled{color:#c9ced2;text-decoration:none;cursor:not-allowed}button.left:before{border:solid #0d74af;border-width:0 2px 2px 0;content:\"\";display:inline-block;padding:2px;position:relative;top:-2px;margin-right:.5rem;transform:rotate(135deg);-webkit-transform:rotate(135deg)}button.left:before:hover{color:#0a5783;text-decoration:underline}button.left:before:active{color:#08486d;text-decoration:underline}button.left:before:disabled{color:#c9ced2;text-decoration:none;cursor:not-allowed}button.right{background:transparent;font-size:1rem;line-height:2rem;height:auto;min-width:0;padding:0;color:#0d74af}button.right:hover{color:#0a5783;text-decoration:underline}button.right:active{color:#08486d;text-decoration:underline}button.right:disabled{color:#c9ced2;text-decoration:none;cursor:not-allowed}button.right:after{border:solid #0d74af;border-width:0 2px 2px 0;content:\"\";display:inline-block;padding:2px;position:relative;top:-2px;margin-left:.5rem;transform:rotate(-45deg);-webkit-transform:rotate(-45deg)}button.right:after:hover{color:#0a5783;text-decoration:underline}button.right:after:active{color:#08486d;text-decoration:underline}button.right:after:disabled{color:#c9ced2;text-decoration:none;cursor:not-allowed}button.action{background:#128020}button.action:hover{background:#0e6018}button.action:active{background:#0b5014}button.action:disabled{color:#c9ced2;background:#f2f3f4;border-color:#f2f3f4;cursor:not-allowed}button.progressive{background:#0d74af}button.progressive:hover{background:#0a5783}button.progressive:active{background:#08486d}button.regressive{background:#687680}button.regressive:hover{background:#273b49}button.regressive:active{background:#08486d}button.destructive{background:#d03027}button.destructive:hover{background:#9c241d}button.destructive:active{background:#821e18}button.text{background:transparent;font-size:1rem;line-height:2rem;height:auto;min-width:0;padding:0;color:#0d74af}button.text:hover{color:#0a5783;text-decoration:underline}button.text:active{color:#08486d;text-decoration:underline}button.text:disabled{color:#c9ced2;text-decoration:none;cursor:not-allowed}button svg{display:none;height:44px;margin:1px;animation:spinner-rotate .95s linear infinite}button svg.small{height:10px}button svg.loading{display:inline}button svg .group .primary{fill:var(--primary-color,currentColor);opacity:var(--primary-opacity,1)}button svg .group .secondary{fill:var(--secondary-color,currentColor);opacity:var(--secondary-opacity,.4)}@media only screen and (min-width:600px){button{min-width:88px}}@keyframes spinner-rotate{0%{transform:rotate(0deg);-ms-transform:rotate(0deg)}to{transform:rotate(1turn);-ms-transform:rotate(1turn)}}";

class SquidButton extends SquidBase {
  static get styles() {
    return [css$3];
  }
  static get boundAttributes() {
    return ['disabled', 'loading', 'size', 'type', 'variant'];
  }
  static get booleanAttributes() {
    return ['disabled', 'loading'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    /** Set up listeners */
    this.bindMethods(['_linkButton', '__onButtonClick', '__onFormSubmit']);

    this.constructor.boundAttributes.forEach(attribute =>
      this.updatedCallbacks.set(attribute, this._linkButton)
    );
    this._previousType = 'none';
  }

  connected() {
    const { button } = this.refs;
    this.form = findParentForm(this);
    this.type === this.type || 'submit';
    if (this.form) {
      button.setAttribute('type', 'submit');
      button.addEventListener('click', this.__onButtonClick);
      this.form.addEventListener('submit', this.__onFormSubmit);
    }
  }

  disconnected() {
    const { button } = this.refs;
    super.disconnected();
    button.removeEventListener('click', this.submitForm);
  }

  render() {
    this.html`<button class="${this.variant} ${
      this.size === 'small' ? 'small' : ''
    }" data-ref="button" roll='button'><slot data-ref='slot'></slot>
      <svg data-ref='spinner'  aria-hidden="true" focusable="false" data-prefix="fad" data-icon="spinner" role="img"
    viewBox="0 0 512 512" 
    class="spinner ${this.size === 'small' ? 'small' : ''}">
    <g class="group">
        <path fill="currentColor"
            d="M108.92 355.08a48 48 0 1 0 48 48 48 48 0 0 0-48-48zM256 416a48 48 0 1 0 48 48 48 48 0 0 0-48-48zm208-208a48 48 0 1 0 48 48 48 48 0 0 0-48-48zm-60.92 147.08a48 48 0 1 0 48 48 48 48 0 0 0-48-48zm0-198.16a48 48 0 1 0-48-48 48 48 0 0 0 48 48z"
            class="secondary"></path>
        <path fill="currentColor"
            d="M108.92 60.92a48 48 0 1 0 48 48 48 48 0 0 0-48-48zM48 208a48 48 0 1 0 48 48 48 48 0 0 0-48-48zM256 0a48 48 0 1 0 48 48 48 48 0 0 0-48-48z"
            class="primary"></path>
    </g>
</svg>
      </button>`;
  }

  /**
   * Submits a form if one is present
   */
  submitForm() {
    if (!this.disabled) {
      const submitEvent = new Event('submit');
      this.form.dispatchEvent(submitEvent);
      this.form._inkSubmit = true;
    }
  }

  /**
   * Keep properties in sync between `this` and the button
   * @param {any} value - The value to link to button prop
   * @param {string} prop - The prop name to link
   */
  _linkButton(value, prop) {
    const { button, spinner, slot } = this.refs;
    if (button) {
      const buttonVariants = [
        'action',
        'destructive',
        'ghost',
        'left',
        'progressive',
        'regressive',
        'right',
        'text',
      ];
      if (prop === 'variant') {
        buttonVariants.forEach(variant => {
          button.classList.contains(variant)
            ? button.classList.remove(variant)
            : null;
        });
        button.classList.add(value);
      }

      if (prop === 'size') {
        button.classList.toggle('small', value === 'small');
      }

      if (prop === 'disabled' || prop === 'type') {
        button[prop] = value;
      }

      if (prop === 'loading') {
        if (value) {
          button.style.width = window.getComputedStyle(button).width;
        } else {
          button.removeAttribute('style');
        }
        button.classList.toggle('loading-active', value);
        button.classList.toggle('loading', value);
        // slot.classList.toggel('loading', value);
        // spinner.classList.add('loading');
        slot.classList.toggle('loading', value);
        spinner.classList.toggle('loading', value);

        this.disabled = value;
      }
    }
  }

  /**
   * Handle button click event
   * @param {Event} event
   */
  __onButtonClick(event = {}) {
    const triggerEvent =
      this.form && !this.disabled && event && !event.defaultPrevented;
    /** This is to give external listeners time to call preventDefault */
    setTimeout(() => {
      if (triggerEvent && this.type !== 'reset') {
        this.submitForm();
      } else if (triggerEvent && this.type === 'reset') {
        this.form.reset();
      }
    });
  }

  /**
   * If the form is submitted by this button
   * and not prevented, submit the form
   * @param {Event} event - submit event
   */
  __onFormSubmit(event) {
    if (
      !event.isTrusted &&
      event.target._inkSubmit &&
      !event.defaultPrevented
    ) {
      event.target.submit();
    }
    delete event.target._inkSubmit;
  }
}
defineSquidElement('squid-button', SquidButton);

var css$4 = ".container{background-color:transparent;border-radius:0;padding:0;box-shadow:none}.container--radius-2{border-radius:2px}.container--radius-4{border-radius:4px}.margin--tiny{margin:8px}.padding--tiny{padding:8px}.margin__top--tiny{margin-top:8px}.padding__top--tiny{padding-top:8px}.margin__right--tiny{margin-right:8px}.padding__right--tiny{padding-right:8px}.margin__bottom--tiny{margin-bottom:8px}.padding__bottom--tiny{padding-bottom:8px}.margin__left--tiny{margin-left:8px}.padding__left--tiny{padding-left:8px}.margin--small{margin:16px}.padding--small{padding:16px}.margin__top--small{margin-top:16px}.padding__top--small{padding-top:16px}.margin__right--small{margin-right:16px}.padding__right--small{padding-right:16px}.margin__bottom--small{margin-bottom:16px}.padding__bottom--small{padding-bottom:16px}.margin__left--small{margin-left:16px}.padding__left--small{padding-left:16px}.margin--normal{margin:24px}.padding--normal{padding:24px}.margin__top--normal{margin-top:24px}.padding__top--normal{padding-top:24px}.margin__right--normal{margin-right:24px}.padding__right--normal{padding-right:24px}.margin__bottom--normal{margin-bottom:24px}.padding__bottom--normal{padding-bottom:24px}.margin__left--normal{margin-left:24px}.padding__left--normal{padding-left:24px}.margin--medium{margin:32px}.padding--medium{padding:32px}.margin__top--medium{margin-top:32px}.padding__top--medium{padding-top:32px}.margin__right--medium{margin-right:32px}.padding__right--medium{padding-right:32px}.margin__bottom--medium{margin-bottom:32px}.padding__bottom--medium{padding-bottom:32px}.margin__left--medium{margin-left:32px}.padding__left--medium{padding-left:32px}.margin--large{margin:48px}.padding--large{padding:48px}.margin__top--large{margin-top:48px}.padding__top--large{padding-top:48px}.margin__right--large{margin-right:48px}.padding__right--large{padding-right:48px}.margin__bottom--large{margin-bottom:48px}.padding__bottom--large{padding-bottom:48px}.margin__left--large{margin-left:48px}.padding__left--large{padding-left:48px}.margin--xlarge{margin:64px}.padding--xlarge{padding:64px}.margin__top--xlarge{margin-top:64px}.padding__top--xlarge{padding-top:64px}.margin__right--xlarge{margin-right:64px}.padding__right--xlarge{padding-right:64px}.margin__bottom--xlarge{margin-bottom:64px}.padding__bottom--xlarge{padding-bottom:64px}.margin__left--xlarge{margin-left:64px}.padding__left--xlarge{padding-left:64px}.margin--xxlarge{margin:96px}.padding--xxlarge{padding:96px}.margin__top--xxlarge{margin-top:96px}.padding__top--xxlarge{padding-top:96px}.margin__right--xxlarge{margin-right:96px}.padding__right--xxlarge{padding-right:96px}.margin__bottom--xxlarge{margin-bottom:96px}.padding__bottom--xxlarge{padding-bottom:96px}.margin__left--xxlarge{margin-left:96px}.padding__left--xxlarge{padding-left:96px}.elevation{box-shadow:0 1px 4px 0 rgba(0,0,0,.2)}.elevation--none{box-shadow:none}.elevation--level-1{box-shadow:0 1px 4px 0 rgba(0,0,0,.2)}.elevation--level-2{box-shadow:0 2px 8px 0 rgba(0,0,0,.2)}.elevation--level-3{box-shadow:0 4px 16px 0 rgba(0,0,0,.2)}:host{display:block}*{box-sizing:border-box}.container{height:100%;width:100%}:host([background=white]) .container{background:#fff;color:#273b49}:host([background=digital-gray-120]) .container{background:#273b49;color:#fff}:host([background=black]) .container{background:#000;color:#fff}:host([background=blue]) .container,:host([background=core-blue-40]) .container{background:#255f82;color:#fff}:host([background=green-70]) .container,:host([background=green]) .container{background:#008140;color:#fff}:host([background=red-50]) .container,:host([background=red]) .container{background:#cc2427;color:#fff}:host([background=yellow-50]) .container,:host([background=yellow]) .container{background:#f9c606;color:#273b49}:host([background=light-blue-10]) .container,:host([background=light-blue]) .container{background:#c0e7f3;color:#273b49}:host([background=green-10]) .container,:host([background=light-green]) .container{background:#dae8d8;color:#273b49}:host([background=light-red]) .container,:host([background=red-10]) .container{background:#fcd5d1;color:#273b49}:host([background=light-yellow]) .container,:host([background=yellow-10]) .container{background:#fff1d0;color:#273b49}";

class SquidContainer extends SquidBase {
  static get styles() {
    return [css$4];
  }
  static get boundAttributes() {
    return ['background', 'radius', 'padding', 'elevation'];
  }
  static get booleanAttributes() {
    return [];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    /** Set up listeners */
    this.bindMethods(['_setProp']);
    this.updatedCallbacks.set('radius', this._setProp);
    this.updatedCallbacks.set('padding', this._setProp);
    this.updatedCallbacks.set('elevation', this._setProp);
    this.updatedCallbacks.set('margin', this._setProp);
    this.updatedCallbacks.set('radius', this._setProp);

    /** Cache values to remove later */
    this._cachedProps = {
      elevation: 'empty',
      margin: 'empty',
      padding: 'empty',
      radius: 'empty',
    };
  }

  render() {
    this.html`<div class="container" data-ref="container"><slot></slot></div>`;
  }

  connected() {
    this.container = this.refs.container;
  }
  /**
   * Update any given property passed to this function
   * @param {string} value - The new value
   * @param {string} prop - The prop to update
   */
  _setProp(value, prop) {
    if (this.container) {
      /** Allow number and level variants */
      if (prop === 'elevation' && !isNaN(value)) {
        value = `level-${value}`;
      }
      const className =
        prop === 'radius' ? `container--${prop}-${value}` : `${prop}--${value}`;
      this.container.classList.remove(className);
      this.container.classList.add(className);
      this._cachedProps[prop] = className;
    }
  }
}
defineSquidElement('squid-container', SquidContainer);

var css_248z$1 = "squid-container{width:fit-content}.box{display:flex;justify-content:center}.container{display:grid;grid-template-columns:1fr;justify-items:center;padding:16px;background-color:#fff}.container .info{font-size:1.5rem;font-weight:200;color:grey;margin:16px 0}.container svg{width:46px}";

var css$5 = "div{position:relative;background:#011728;box-sizing:border-box;color:#fff;font-family:Roboto,Helvetica Neue,Helvetica,Arial,sans-serif;font-size:1rem;line-height:1.5em;width:100%;padding:12px 16px 16px 56px}div .alert-message{display:flex;align-items:center}div .alert-message svg{margin-right:16px}div .alert-message svg.hide{display:none}div:after{clear:both;content:\"\";display:table}div .alert--message{padding-right:48px;margin:0}div .alert--message:before{content:\"\";margin-left:-40px;height:24px;position:absolute;top:13px;width:24px}div .alert-link{color:#fff}div .alert-link:hover{color:#c9ced2}.alert-close{background:none;border:0;cursor:pointer;float:right;width:16px;height:16px;right:16px;top:16px;position:absolute}.alert-close span{position:absolute;left:-9999em}.alert-close:before{background-image:url(\"data:image/svg+xml;charset=utf-8,%3Csvg width='16' height='16' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M.7 0L8 7.3 15.3 0l.7.7L8.7 8l7.3 7.3-.7.7L8 8.7.7 16l-.7-.7L7.3 8 0 .7z' fill='%23FFF' fill-rule='evenodd'/%3E%3C/svg%3E\");background-repeat:no-repeat;content:\"\";top:0;left:0;height:16px;right:16px;position:absolute;width:16px}@media only screen and (min-width:600px){.ods-alert--global{padding-bottom:12px}}";

class SquidAlert extends SquidBase {
  static get styles() {
    return [css$5];
  }
  static get boundAttributes() {
    return ['type'];
  }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    /** Set up listeners */
    this.bindMethods(['_setType', 'remove']);
    this._allowedTypes = [
      'global',
      'informational',
      'success',
      'error',
      'warning',
    ];
    this.updatedCallbacks.set('type', this._setType);
  }

  connected() {
    const { close, acknowledge } = this.refs;
    this.type = this.getAttribute('type') || 'global';
    close.addEventListener('click', this.remove);
    acknowledge.addEventListener('click', this.remove);
    this.focus();
  }

  disconnected() {
    const { close, acknowledge } = this.refs;
    close.removeEventListener('click', this.remove);
    acknowledge.removeEventListener('click', this.remove);
  }

  render() {
    this
      .html`<div class="alert alert-global" role="alertdialog" aria-live="polite" data-ref="alert">
      <p class="alert-message">
        <svg id='alert-informational' class='hide' width="24" height="24" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm1.657 16.938C12.869 17.958 11.085 19 10.274 19c-.37 0-.81-.487-.81-.788 0-.186.068-.556.207-.903.14-.301 1.46-4.031 2.04-5.793.162-.486.046-.625-.07-.625-.44 0-1.46.787-1.854 1.181-.094.093-.37-.278-.37-.394 0-.116.115-.301.207-.463.858-1.228 2.481-2.293 3.64-2.293.3 0 .648.463.648.949 0 .255-.092.557-.186.881l-2.039 5.861c-.022.047.047.21.139.21.3 0 1.181-.534 1.622-.882.185-.138.393-.232.487-.232.093 0 .186.047.186.232 0 .348-.21.672-.464.997zm.347-10.288c-.163.14-.44.21-.694.21-.464 0-1.044-.348-1.044-1.02 0-.602.44-1.136.65-1.298.138-.092.439-.185.624-.185.811 0 1.044.718 1.044 1.042 0 .51-.395 1.113-.58 1.251z" fill="#0D74AF" fill-rule="evenodd"/></svg>
        <svg id='alert-global' class='hide' width='24' height='21' xmlns='http://www.w3.org/2000/svg'><path d='M23.538 17.488L13.86 1.208c-1.023-1.61-2.697-1.61-3.72 0L.462 17.488c-1.024 1.61-.288 3.047 1.634 3.047h19.808c1.921 0 2.658-1.436 1.634-3.047zM11.923 6.66a.943.943 0 0 1 1.014 1.004l-.444 5.94a.5.5 0 0 1-.537.458.499.499 0 0 1-.463-.458l-.444-5.94a.94.94 0 0 1 .874-1.004zm.07 11.028a1.12 1.12 0 0 1-1.125-1.114 1.12 1.12 0 0 1 1.125-1.114 1.12 1.12 0 0 1 1.125 1.114 1.12 1.12 0 0 1-1.125 1.114z' fill='#F8CC01' fill-rule='evenodd'/></svg>
        <svg id='alert-warning' class='hide' width='24' height='21' xmlns='http://www.w3.org/2000/svg'><path d='M23.538 17.488L13.86 1.208c-1.023-1.61-2.697-1.61-3.72 0L.462 17.488c-1.024 1.61-.288 3.047 1.634 3.047h19.808c1.921 0 2.658-1.436 1.634-3.047zM11.923 6.66a.943.943 0 0 1 1.014 1.004l-.444 5.94a.5.5 0 0 1-.537.458.499.499 0 0 1-.463-.458l-.444-5.94a.94.94 0 0 1 .874-1.004zm.07 11.028a1.12 1.12 0 0 1-1.125-1.114 1.12 1.12 0 0 1 1.125-1.114 1.12 1.12 0 0 1 1.125 1.114 1.12 1.12 0 0 1-1.125 1.114z' fill='#273B49' fill-rule='evenodd'/></svg>
        <svg id='alert-success' class='hide' width='24' height='24' xmlns='http://www.w3.org/2000/svg'%><path d='M12 0C5.373 0 0 5.372 0 12s5.373 12 12 12 12-5.372 12-12S18.627 0 12 0zm5.78 8.432l-7 8.06a.757.757 0 0 1-.54.258h-.026a.752.752 0 0 1-.53-.22l-3-3a.75.75 0 1 1 1.06-1.06l2.43 2.43 6.473-7.453a.75.75 0 0 1 1.133.985z' fill='#128020' fill-rule='evenodd'/%></svg>
        <svg id='alert-error' class='hide' width='24' height='24' xmlns='http://www.w3.org/2000/svg'><path d='M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12c6.627 0 12-5.372 12-12S18.627 0 12 0zm5.53 16.47a.75.75 0 1 1-1.061 1.06L12 13.06l-4.47 4.47a.747.747 0 0 1-1.06 0 .75.75 0 0 1 0-1.06L10.938 12l-4.47-4.47A.75.75 0 0 1 7.53 6.47L12 10.94l4.469-4.47a.75.75 0 0 1 1.06 1.06L13.06 12l4.47 4.47z' fill='#D03027' fill-rule='evenodd'/></svg>
        <slot name='message'></slot>
      </p>
      <button class="alert-close" aria-label="Close" data-ref="close"></button>
      <a class="alert-link" data-ref="acknowledge" tabindex="0"><slot name="button-text"></slot></a>
  </div>`;
  }

  /**
   * Manage the browser's focus
   * based on the alert's type
   */
  focus() {
    const { close, acknowledge } = this.refs;
    if (this.type === 'global') {
      close.focus();
    } else {
      acknowledge.focus();
    }
  }

  /**
   * Remove the alert from the DOM
   * on any event to a close button
   * and emit an event for anyone who cares
   * @param {Event} event - Optional
   */
  remove(event) {
    event ? event.preventDefault() : null;
    this.parentNode.removeChild(this);
    this.emitEvent(ALERT_CLOSED);
  }

  /**
   * Sets up the alert type based on the attribute
   * value. Will only accept allowed types, otherwise
   * default to 'global'
   * @param {string} value
   */
  _setType(value) {
    const { alert } = this.refs;
    if (alert) {
      if (this._allowedTypes.includes(value)) {
        this.root.querySelectorAll('svg').forEach(item => {
          item.classList.remove('hide');
          item.classList.add('hide');
          if (item.id === `alert-${value}`) {
            item.classList.remove('hide');
          }
        });
        alert.setAttribute('class', `alert--${value} alert--active`);
      } else {
        this.type = 'global';
      }
    }
  }
}
defineSquidElement('squid-alert', SquidAlert);

class MagicElectronApi {
  constructor() {
    this.myHeader = new Headers();
    this.myHeader.append('Content-Type', 'application/json');
    // this.myHeader.append('usereid', '');
  }
  __handleErrors() {}
  deleteCall(url, userEid) {
    this.myHeader.set('usereid', userEid);
    let options = {
      headers: this.myHeader,
      method: 'DELETE',
    };
    return fetch(url, options)
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText);
        }
        return res.json();
      })
      .then((data) => {
        return data;
      })
      .catch((error) => {
        throw error;
      });
  }
  postCall(url, data, userEid) {
    if (userEid) {
      this.myHeader.set('usereid', userEid);
    }
    let options = {
      headers: this.myHeader,
      method: 'POST',
      body: JSON.stringify(data),
    };
    return fetch(url, options)
      .then((res) => {
        if (!res.ok) {
          throw res;
        } else {
          return res.json();
        }
      })
      .then((data) => {
        return data;
      })
      .catch((error) => {
        return Promise.reject(error);
      });
  }
  patchCall(url, data, userEid) {
    this.myHeader.set('usereid', userEid);
    let options = {
      headers: this.myHeader,
      method: 'PATCH',
      body: JSON.stringify(data),
    };
    return fetch(url, options)
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText);
        }
        return res.json();
      })
      .then((data) => {
        return data;
      })
      .catch((error) => {
        throw error;
      });
  }
  putCall(url, data, userEid) {
    this.myHeader.set('usereid', userEid);
    let options = {
      headers: this.myHeader,
      method: 'PUT',
      body: JSON.stringify(data),
    };
    return fetch(url, options)
      .then((res) => {
        if (!res.ok) {
          throw res;
        } else {
          return res.json();
        }
      })
      .then((data) => {
        return data;
      })
      .catch((error) => {
        return Promise.reject(error);
      });
  }
  getCall(url) {
    let options = {
      headers: this.myHeader,
    };
    return fetch(url, options)
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText);
        }
        return res.json();
      })
      .then((data) => {
        return data;
      })
      .catch((error) => {
        throw error;
      });
  }
  /**
   *
   * @param {URL} url Url to send data to.
   * @param {File} files Files to be upload
   * @param {Object} userEid UserId for the files.
   */
  uploadFile(url, files, userEid) {
    const formData = new FormData();
    formData.append('file', files);
    if (userEid) {
      this.myHeader.set('usereid', userEid);
    }
    // this.myHeader.set('Content-Type', 'multipart/form-data');
    let options = {
      method: 'POST',
      body: formData,
    };
    return fetch(url, options)
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText);
        }
        return res.json();
      })
      .then((data) => {
        return data;
      })
      .catch((error) => {
        throw error;
      });
  }
}

let _token;
let __mtgUser;
const { ipcRenderer } = window.require('electron');
class MagicElectronAuth extends EventTarget {
  constructor() {
    super();
    this._user;
    this.api = new MagicElectronApi();
    this['__stateChange'] = this['__stateChange'].bind(this);
    this['__addUser'] = this['__addUser'].bind(this);
    this['googleLogin'] = this['googleLogin'].bind(this);
  }
  get user() {
    return this._user;
  }
  get mtgUser() {
    return __mtgUser;
  }
  get token() {
    return _token;
  }
  __stateChange(evt) {
    if (evt) {
      this.dispatchEvent(new CustomEvent('user-login'));
    }
  }
  //http://localhost:5001/arenish-fair/us-central1/buildDeck
  async __addUser(userId) {
    console.log('add user');
    try {
      __mtgUser = await this.api.postCall(
        `https://us-central1-arenish-fair.cloudfunctions.net/arenishFair/api/users/${userId}`,
        // `http://localhost:5001/arenish-fair/us-central1/arenishFair/api/users/${userId}`,
        { docId: userId },
        userId
      );
    } catch (error) {
      console.log(error);
    }
  }

  async googleLogin() {
    ipcRenderer.send('google_login');
    ipcRenderer.on('user_complete', async (evt, ...arg) => {
      __mtgUser = arg[0];
      await this.__addUser(arg[0].sub);
      this.dispatchEvent(new CustomEvent('login-user'));
    });
  }
}

class MagicElectronLogin extends MagicElectronBase {
  static get boundAttributes() {
    return [];
  }
  static get booleanAttributes() {
    return [];
  }
  static get styles() {
    return [css_248z$1];
  }

  constructor() {
    super();
    this.bindMethods(['__googleUser']);
    this.magicElectronAuth = new MagicElectronAuth();
    // eslint-disable-next-line no-unused-vars
    this.baseTemplate = (style) => html`<div class='box'>
    <squid-container elevation='2'>
    <div class='container' data-ref='container'>
    <div class='info'>Please use your Google login and click the G below to login.</div>
      <a href='javascript:void(0)' data-ref='googleLogin'>
      <svg aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img"viewBox="0 0 488 512" class="google"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" class=""></path></svg>
      </a>
    </div>
    </spid-container>
  </div>`;
  }

  render() {
    render(this.baseTemplate(this.htmlLitStyle()), this.root);
    this.buildRefs();
    this.refs['googleLogin'].addEventListener('click', this.__googleUser);
  }
  async __googleUser() {
    this.magicElectronAuth.addEventListener('login-user', () => {
      this.emitEvent('login-complete');
    });
    this.magicElectronAuth.googleLogin();
  }
}
defineElement('magic-electron-login', MagicElectronLogin);

var css_248z$2 = ".container{display:flex;width:auto;justify-content:center;align-items:flex-start}.container .box{display:grid;margin:4px;width:99%;background-color:#fff;grid-template-columns:repeat(3,62px 1fr 1fr 1fr);justify-items:center;align-items:center;grid-row-gap:4px}.container .box img{height:45px}.container .box .label{grid-column:1/-1;font-size:1.25rem}.container .box .name{width:109px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.container .small{display:grid;width:48%;margin:4px;background-color:#fff;grid-template-columns:repeat(3,62px 1fr);justify-items:center;align-items:center}.container .small img{height:45px}.container .small .label{grid-column:1/-1;font-size:1.25rem}";

class MagicElectronPlayList extends MagicElectronBase {
  static get boundAttributes() {
    return [];
  }
  static get booleanAttributes() {
    return [];
  }
  static get styles() {
    return [css_248z$2];
  }
  set listData(value) {
    this._list = value;
    this.renderList();
  }
  get listData() {
    return this._list;
  }
  constructor() {
    super();
    this.bindMethods(['renderList']);
    // eslint-disable-next-line no-unused-vars
    this.baseTemplate = (style) => html`
      <div class="container">
        <div class="box" data-ref="box"></div>
      </div>
    `;
    // eslint-disable-next-line no-unused-vars
    // prettier-ignore
    this.listTemplate = (cards,oppoonent) => html`
    <div class='label'>Oppoonent: ${oppoonent.playerName}</div>
    ${cards.map(card => html`
    <img
            src="${card.image_uris ? card.image_uris.art_crop : ''}"
          />
          <div class="name">${card.name}</div>
          <div>${card.remaining} - ${card.number}</div>
          <div>${new Intl.NumberFormat('en-US', { style: 'percent',minimumFractionDigits: 2,
    maximumFractionDigits: 2 }).format(
    card.remaining / this._list.librarySize)}</div>
    `)}
    `;
    // eslint-disable-next-line no-unused-vars
    // prettier-ignore
    this.handTemplate = (cards) => html`
    <div class='label'>Hand</div>
      ${cards.map(
    (card) => html`
          <img src="${card.image}" />
          <div>${card.name}</div>
        `)}
    `;
  }

  render() {
    render(this.baseTemplate(this.htmlLitStyle()), this.root);
    this.buildRefs();
  }
  renderList() {
    const { box } = this.refs;

    render(this.listTemplate(this._list.cards, this._list.oppoonent), box);
  }
}
defineElement('magic-electron-play-list', MagicElectronPlayList);

class Icons {
  static sorcery() {
    return `<svg viewBox="0 0 610 758">
    <g transform="translate(-248.75759,103.7998)" id="sorceryIcon">
      <path d="m 549.35881,651.15793 c -7.26111,-3.30528 -9.75906,-6.38344 -9.75906,-12.02521 0,-9.63732 8.08597,-14.82133 32.81288,-21.03582
       10.615,-2.66807 21.08723,-6.33414 23.27159,-8.14697 6.81083,-5.65252 4.49888,-16.5977 -5.23635,-24.78929 -23.09774,-19.43541 -67.63066,
       -21.56509 -115.4088,-5.51909 -36.947,12.4082 -52.50696,14.06376 -79.62666,8.47176 -34.64907,-7.14427 -67.84003,-25.03721 -93.95261,-50.64833
        -26.21188,-25.70856 -39.07084,-47.2129 -47.17177,-78.88733 -13.77915,-53.87651 -1.31183,-108.98633 31.84244,-140.75376 22.18432,-21.25618
         63.3297,-33.24003 73.21822,-21.32512 3.03843,3.66117 1.3796,5.78081 -9.81608,12.54327 -38.97877,23.54405 -42.44669,77.09646 -7.39267,
         114.16076 29.4188,31.10591 66.36486,43.04256 133.33259,43.07667 77.97133,0.0397 108.53348,6.46944 138.17357,29.06853 15.91748,12.1362
          33.35102,35.33256 37.51949,49.92138 5.0202,17.56954 7.82356,20.67854 15.123,16.77202 9.13048,-4.88654 17.30572,-26.03103 17.38026,
          -44.95259 0.17058,-43.53187 -29.41295,-86.80809 -73.86362,-108.04745 -17.36811,-8.29885 -26.87761,-10.32104 -98.17715,-20.87833
           -23.04844,-3.41301 -33.22998,-7.90698 -48.71307,-21.50106 -11.7892,-10.35119 -19.40549,-22.99003 -19.40549,-32.20276 0,-8.91341
            3.13517,-9.47539 23.06736,-4.13482 14.85755,3.98106 19.78241,4.20141 27.00777,1.20854 13.29452,-5.5067 20.36543,-19.68263 20.42174,
            -40.94091 0.11216,-42.38594 -35.18535,-71.20981 -114.03762,-93.1233 C 356.52243,185.39467 317.72545,156.03943 301.5472,122.99917
             284.34055,87.85892 279.29745,39.536552 288.96328,2.4264521 306.88472,-66.378407 371.02643,-108.50168 450.07709,-103.38006 c 35.58306,2.30541
              62.68734,13.967959 58.74366,25.276943 -0.4129,1.184015 -14.26332,2.339288 -30.77877,2.567351 -19.8892,0.274798 -34.59065,2.122206
               -43.54098,5.471189 -43.63514,16.327808 -61.94402,50.84462 -49.67719,93.654906 7.33612,25.603172 28.66824,44.991379 77.06305,70.040047
                48.43336,25.068764 50.03238,26.213994 89.59182,64.170704 37.99478,36.45512 51.65803,44.90072 72.63941,44.90072 48.47589,0 64.72472,
                -58.86938 28.19389,-102.14586 C 642.01314,88.355472 633.86991,84.008945 592.149,68.443608 565.01575,58.320717 558.94683,54.937385
                 558.15912,49.494938 c -1.87638,-12.964572 19.99622,-15.887338 58.8897,-7.869829 45.31432,9.341259 94.90108,38.511196 137.35432,
                 80.800391 40.53175,40.37475 65.35563,84.30293 80.83521,143.04448 35.48117,134.64419 -0.2748,268.71238 -90.85178,340.65077 -22.29018,
                 17.70367 -59.43089,35.45314 -87.67712,41.90131 -31.36972,7.1611 -94.45921,9.00407 -107.35064,3.13587 z"  id="corceryPath" style="fill:currentColor"/>
    </g>
  </svg>`;
  }
  static land() {
    return `<svg viewBox="0 0 600 600"  >
    <defs />
    <g transform="translate(-109.58004,-73.095985)" class="LandIcon">
      <path d="M 328.63936,541.67929 C 246.53884,533.77761 165.84388,512.6966 132.07303,490.32766 96.641563,466.85884 
      102.10545,442.36571 155.33678,386.04328 c 47.79682,-50.57247 69.78599,-92.9501 100.81797,-194.29796 20.38021,-66.55995 
      39.18723,-108.401257 51.90149,-115.468842 19.63437,-10.914083 33.19725,4.882525 59.18602,68.933912 27.62365,68.08066 
      51.2835,109.36882 80.49105,140.46283 8.81695,9.38627 17.39024,15.77384 21.17158,15.77384 7.47226,0 18.42198,-13.08595 
      38.06261,-45.48852 15.90054,-26.23243 28.05191,-34.47776 46.56017,-31.59338 17.13916,2.6709 30.08009,19.69425 45.28907,59.57568 
      7.13786,18.71712 17.37737,42.81959 22.75449,53.56078 10.08757,20.15073 35.72363,57.03791 39.7181,57.14976 4.60422,0.12868 
      39.1318,34.82074 43.89588,44.10456 14.44499,28.14975 -6.88892,53.0083 -61.48392,71.64177 -65.61796,22.39567 -124.91599,31.36027 
      -217.5119,32.88281 -38.00751,0.62508 -81.90503,-0.0957 -97.55003,-1.60123 z"  class="landPath" style="fill:currentColor"/>
    </g>
  </svg>`;
  }
  static creature() {
    return `<svg viewBox="0 0 600 600">
    <g transform="translate(-510.31037,-331.03141)" class="creatureIcon">
      <path d="m 713.85991,852.97324 c -13.24237,-13.24237 -14.84693,-23.54582 -7.09008,-45.53094 6.99159,-19.81635 16.57282,-30.21975 
      46.99885,-51.03259 15.37837,-10.51951 42.36291,-30.01837 59.96548,-43.3307 30.71662,-23.23012 46.24631,-32.88718 138.57862,-86.17383 
      67.21712,-38.79226 157.99762,-74.97988 157.99762,-62.98235 0,5.72718 -21.6024,21.17322 -51.8605,37.08105 -38.8505,20.42524 
      -148.00006,94.34145 -180.46523,122.21143 -25.57402,21.9543 -59.52308,58.95089 -95.23194,103.78065 -32.31156,40.56494
       -48.28299,46.58727 -68.89282,25.97728 z M 582.44653,816.20576 c -8.45298,-9.07328 -10.25942,-20.87627 -6.1929,-40.46499 5.2375,
       -25.22816 4.44304,-50.05388 -2.02527,-63.29429 -4.62779,-9.47312 -9.75636,-13.42386 -30.8275,-23.74688 -13.90181,-6.81075 -27.06754,
       -14.83324 -29.25718,-17.82777 -8.88347,-12.14885 -1.85438,-42.35067 16.19924,-69.60247 15.03429,-22.6943 70.08906,-84.7188 103.21529,
       -116.28207 34.27584,-32.65888 56.12645,-47.6048 82.96195,-56.74722 20.31794,-6.9218 32.05522,-12.39753 98.21751,-45.81973 78.12883,
       -39.46719 156.03835,-62.44863 156.03835,-46.0273 0,2.79086 -15.37038,11.06447 -42.01036,22.61341 -58.01571,25.15103 -67.51638,30.78852
        -109.88679,65.20542 -20.43225,16.59679 -52.72358,41.95507 -71.75852,56.35162 -36.37515,27.5111 -64.18822,55.36967 -93.04461,93.19691
         -37.09377,48.6251 -41.04109,58.81668 -29.87389,77.13251 3.29473,5.40382 5.94112,13.84359 5.99037,18.75463 0.11904,11.89398 5.92237,
         8.12016 11.5416,3.70876 8.32595,-6.53631 22.8854,-19.75439 46.97278,-42.4296 63.70864,-59.9738 148.65491,-122.48685 207.54269,-152.73336 
         37.96748,-19.50115 139.96581,-61.43062 168.98981,-69.46828 26.6216,-7.37234 42.0707,-8.09195 42.0707,-1.95939 0,5.34202 -7.4131,9.84589
          -70.7112,42.96168 -87.20664,45.62406 -123.09569,71.60314 -191.85365,138.87721 -37.24738,36.4438 -103.39288,96.203 -150.30449,135.79298
           -5.41638,4.57104 -24.86797,25.80313 -43.2257,47.1823 -18.35757,21.37917 -36.85635,41.60758 -41.10811,44.95205 -9.97667,7.84768 
           -20.15683,7.72767 -27.66012,-0.32613 z"  id="creaturePath" style="fill:currentColor"/>
    </g>
  </svg>`;
  }
  static minusSquare() {
    return `<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="minus-square" role="img"  viewBox="0 0 448 512" class="minus-square">
    <path fill="currentColor" d="M108 284c-6.6 0-12-5.4-12-12v-32c0-6.6 5.4-12 12-12h232c6.6 0 12 5.4 12 12v32c0 6.6-5.4 12-12 12H108zM448 80v352c0 
    26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V80c0-26.5 21.5-48 48-48h352c26.5 0 48 21.5 48 48zm-48 346V86c0-3.3-2.7-6-6-6H54c-3.3 0-6 2.7-6 6v340c0 
    3.3 2.7 6 6 6h340c3.3 0 6-2.7 6-6z" class=""></path></svg>`;
  }
  static addSquare() {
    return `<svg aria-hidden="true" focusable="false" data-prefix="fal" data-icon="plus-square" role="img" 
    viewBox="0 0 448 512" class="plus-square">
    <path fill="currentColor" d="M400 64c8.8 0 16 7.2 16 16v352c0 8.8-7.2 16-16 16H48c-8.8 0-16-7.2-16-16V80c0-8.8 
    7.2-16 16-16h352m0-32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zm-60 
    206h-98v-98c0-6.6-5.4-12-12-12h-12c-6.6 0-12 5.4-12 12v98h-98c-6.6 0-12 5.4-12 12v12c0 6.6 5.4 12 12 12h98v98c0 6.6 5.4 12 
    12 12h12c6.6 0 12-5.4 12-12v-98h98c6.6 0 12-5.4 12-12v-12c0-6.6-5.4-12-12-12z" class=""></path></svg>`;
  }
  static edit() {
    return `
<svg aria-hidden="true" focusable="false" data-prefix="fal" data-icon="edit" role="img"  viewBox="0 0 576 512" class="icon-edit x">
    <path fill="currentColor" d="M417.8 315.5l20-20c3.8-3.8 10.2-1.1 10.2 4.2V464c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V112c0-26.5 
    21.5-48 48-48h292.3c5.3 0 8 6.5 4.2 10.2l-20 20c-1.1 1.1-2.7 1.8-4.2 1.8H48c-8.8 0-16 7.2-16 16v352c0 8.8 7.2 16 16 16h352c8.8 0 
    16-7.2 16-16V319.7c0-1.6.6-3.1 1.8-4.2zm145.9-191.2L251.2 436.8l-99.9 11.1c-13.4 1.5-24.7-9.8-23.2-23.2l11.1-99.9L451.7 12.3c16.4-16.4 
    43-16.4 59.4 0l52.6 52.6c16.4 16.4 16.4 43 0 59.4zm-93.6 48.4L403.4 106 169.8 339.5l-8.3 75.1 75.1-8.3 233.5-233.6zm71-85.2l-52.6-52.6c-3.8-3.8-10.2-4-14.1 
    0L426 83.3l66.7 66.7 48.4-48.4c3.9-3.8 3.9-10.2 0-14.1z" class="">
</path>
</svg>
        `;
  }
  static save() {
    return `
<svg aria-hidden="true" focusable="false" data-prefix="fal" data-icon="save" role="img" viewBox="0 0 448 512" class="icon-save">
  <path fill="currentColor" d="M433.941 129.941l-83.882-83.882A48 48 0 0 0 316.118 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 
  48 48h352c26.51 0 48-21.49 48-48V163.882a48 48 0 0 0-14.059-33.941zM288 64v96H96V64h192zm128 368c0 8.822-7.178 16-16 16H48c-8.822 0-16-7.178-16-16V80c0-8.822 
  7.178-16 16-16h16v104c0 13.255 10.745 24 24 24h208c13.255 0 24-10.745 24-24V64.491a15.888 15.888 0 0 1 7.432 4.195l83.882 83.882A15.895 15.895 
  0 0 1 416 163.882V432zM224 232c-48.523 0-88 39.477-88 88s39.477 88 88 88 88-39.477 88-88-39.477-88-88-88zm0 144c-30.879 0-56-25.121-56-56s25.121-56 
56-56 56 25.121 56 56-25.121 56-56 56z" class=""></path>
</svg>
        `;
  }
  static arrowUp() {
    return `
<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="arrow-alt-up" role="img" viewBox="0 0 448 512" class="con-arrow-up ">
  <path fill="currentColor" d="M272 480h-96c-13.3 0-24-10.7-24-24V256H48.2c-21.4 0-32.1-25.8-17-41L207 39c9.4-9.4 24.6-9.4 34 0l175.8 176c15.1 
  15.1 4.4 41-17 41H296v200c0 13.3-10.7 24-24 24z" class="">
  </path>
</svg>    
    `;
  }
  static star() {
    return `
<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="star" role="img" viewBox="0 0 576 512" class="icon-star ">
  <path fill="currentColor" d="M259.3 17.8L194 150.2 47.9 171.5c-26.2 3.8-36.7 36.1-17.7 54.6l105.7 103-25 145.5c-4.5 26.3 23.2 
  46 46.4 33.7L288 439.6l130.7 68.7c23.2 12.2 50.9-7.4 46.4-33.7l-25-145.5 105.7-103c19-18.5 8.5-50.8-17.7-54.6L382 150.2 
  316.7 17.8c-11.7-23.6-45.6-23.9-57.4 0z" class="">
  </path>
</svg>    
    `;
  }
  static addLayers() {
    return `
    <svg aria-hidden="true" focusable="false" data-prefix="fal" data-icon="layer-plus" role="img"  viewBox="0 0 512 512" class="icon-layer-plus ">
      <path fill="currentColor" d="M504 96h-88V8c0-4.42-3.58-8-8-8h-16c-4.42 0-8 3.58-8 8v88h-88c-4.42 0-8 3.58-8 8v16c0 4.42 3.58 8 8 
      8h88v88c0 4.42 3.58 8 8 8h16c4.42 0 8-3.58 8-8v-88h88c4.42 0 8-3.58 8-8v-16c0-4.42-3.58-8-8-8zm-6.77 270.71l-99.72-42.87 99.72-42.87c8.35-3.6 
      12.19-13.23 8.58-21.52-3.65-8.29-13.32-12.13-21.74-8.48l-225.32 96.86c-1.81.77-3.74.77-5.48 0L45.23 258.4l193.45-83.16c8.35-3.59 12.19-13.23 
      8.58-21.52-3.65-8.28-13.26-12.13-21.74-8.48L14.81 235.81C5.81 239.66 0 248.52 0 258.4c0 9.87 5.81 18.74 14.77 22.58l99.73 42.87-99.7 42.85C5.81 
      370.55 0 379.42 0 389.31c0 9.87 5.81 18.74 14.77 22.58l225.32 96.84c5.06 2.17 10.48 3.28 15.9 3.28s10.84-1.09 15.9-3.28l225.29-96.83c9-3.85 
      14.81-12.72 14.81-22.59.01-9.89-5.8-18.76-14.76-22.6zM258.74 478.72c-1.81.77-3.74.77-5.48 0L45.23 389.29 156 341.68l84.1 36.15c5.06 2.17 10.48 
      3.28 15.9 3.28s10.84-1.09 15.9-3.28l84.12-36.16 110.78 47.62-208.06 89.43z" class=""></path>
    </svg>
    `;
  }
  static trash() {
    return `
    <svg aria-hidden="true" focusable="false" data-prefix="fad" data-icon="trash" role="img" viewBox="0 0 448 512" class="trash">
    <g class="fa-group">
      <path fill="currentColor" d="M53.2 467L32 96h384l-21.2 371a48 48 0 0 1-47.9 45H101.1a48 48 0 0 1-47.9-45z" class="trash-secondary">
      </path>
      <path fill="currentColor" d="M0 80V48a16 16 0 0 1 16-16h120l9.4-18.7A23.72 23.72 0 0 1 166.8 0h114.3a24
     24 0 0 1 21.5 13.3L312 32h120a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16H16A16 16 0 0 1 0 80z" class="trash-primary">
      </path>
     </g>
     </svg>
    `;
  }
}

const { ipcRenderer: ipcRenderer$1 } = window.require('electron');
class MagicElectronApp extends MagicElectronBase {
  static get boundAttributes() {
    return [];
  }
  static get booleanAttributes() {
    return [];
  }
  static get styles() {
    return [css_248z];
  }

  constructor() {
    super();
    this.magicElectronAuth = new MagicElectronAuth();
    this.magicElectronApi = new MagicElectronApi();
    this.__user = this.magicElectronAuth.user;
    this.show = true;
    this.bindMethods(['loginComplete', 'saveUser', 'updateGame', 'toggleSize']);
    this.magicElectronAuth.addEventListener('login-user', this.loginComplete);
    ipcRenderer$1.on('appSetup', (evt, ...args) => {
      this.logPath = args[0];
    });
    ipcRenderer$1.on('gameUpdate', this.updateGame);
    // eslint-disable-next-line no-unused-vars
    this.baseTemplate = (style) => html`<div class="content">
      <header>
        <div class="logo">
          <img src="/assets/logo.svg" class="logoImage" />
          Magic Arena Snoop
        </div>
      </header>
      <div data-ref="sink" class="sink"></div>
      <footer></footer>
    </div> `;
    this.loginTemplate = () =>
      html`<magic-electron-login data-ref="login"></magic-electron-login>`;
    // prettier-ignore
    this.infoTemplate = () =>
      html`<div class="box">
          <squid-container elevation="2">
            <div class="container">
              <div class="openClose" @click="${this.toggleSize}">User Info
                <div data-ref="close" class='svgDiv'>${unsafeHTML(Icons.minusSquare())}</div>
                <div class="svgDiv show" data-ref="open">${unsafeHTML(Icons.addSquare())}</div>
              </div>
              <div data-ref="info">
                <squid-input data-ref="filePath">File Path</squid-input>
                <squid-input data-ref="accountId">Magic AccountId</squid-input>
                <squid-button data-ref="save">Save</squid-button>
              </div>
            </div>
          </squid-container>
        </div>
        <magic-electron-play-list data-ref="list"></magic-electron-play-list>`;
    this.gameTemplate = () =>
      html`<magic-electron-play-list></magic-electron-play-list>`;
  }
  updateGame(evt, ...args) {
    const { list } = this.refs;
    list.listData = args[0];
  }
  render() {
    render(this.baseTemplate(this.htmlLitStyle()), this.root);
    this.buildRefs();
  }
  toggleSize() {
    const { info, close, open } = this.refs;
    info.classList.toggle('show');
    close.classList.toggle('show');
    open.classList.toggle('show');
  }
  connected() {
    const { sink } = this.refs;
    /**no login for alpha */
    /**remove above line after alpha */
    if (this.magicElectronAuth.user) {
      render(this.infoTemplate(), sink);
      this.buildRefs();
      this.refs['save'].addEventListener('click', this.saveUser);
    } else {
      render(this.loginTemplate(), sink);
      this.buildRefs();
      this.refs['login'].addEventListener('login-complete', this.loginComplete);
    }
  }

  saveUser() {
    console.log('saveUser');
    const { accountId } = this.refs;
    this.magicElectronAuth.mtgUser.accountId = accountId.value;
    console.log(this.magicElectronAuth.mtgUser);
    this.magicElectronApi.postCall(
      `https://us-central1-arenish-fair.cloudfunctions.net/arenishFair/api/users/${this.magicElectronAuth.mtgUser.providerId}`,
      // `http://localhost:5001/arenish-fair/us-central1/arenishFair/api/users/${this.magicElectronAuth.mtgUser.providerId}`,
      // `/api/users/${this.magicElectronAuth.mtgUser._id}`,
      this.magicElectronAuth.mtgUser
    );
  }
  loginComplete() {
    const { sink } = this.refs;
    this.__user = this.magicElectronAuth.user;
    render(this.infoTemplate(), sink);
    this.buildRefs();
    this.refs['save'].addEventListener('click', this.saveUser);
    this.refs['accountId'].value = this.magicElectronAuth.mtgUser.accountId;
    this.refs['filePath'].value = this.logPath;
  }
}
defineElement('magic-electron-app', MagicElectronApp);

export { MagicElectronApp };
//# sourceMappingURL=magic-electron-app.js.map
