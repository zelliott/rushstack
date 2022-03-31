/**
 * A class used to exposed events.
 * @public
 * {@docCategory SystemEvent}
 *
 * @myCustomTag
 */
export class SystemEvent {
  /**
   * Adds an handler for the event.
   */
  public addHandler(handler: () => void): void {}
}

/**
 * Example base class
 * @public
 * {@docCategory DocBaseClass}
 */
export class DocBaseClass {
  /**
   * The simple constructor for `DocBaseClass`
   */
  public constructor();

  /**
   * The overloaded constructor for `DocBaseClass`
   */
  public constructor(x: number);

  public constructor(x?: number) {}
}

/**
 * @public
 * {@docCategory DocBaseClass}
 */
export interface IDocInterface1 {
  /**
   * Does something
   */
  regularProperty: SystemEvent;
}

/**
 * @public
 * {@docCategory DocBaseClass}
 */
export interface IDocInterface2 extends IDocInterface1 {
  /**
   * @deprecated Use `otherThing()` instead.
   */
  deprecatedExample(): void;
}

/**
 * A namespace containing an ECMAScript symbol
 * @public
 */
export namespace EcmaSmbols {
  /**
   * An ECMAScript symbol
   */
  export const example: unique symbol = Symbol('EcmaSmbols.exampleSymbol');
}

/**
 * Some less common TypeScript declaration kinds.
 * @public
 * {@docCategory DocClass1}
 */
export interface IDocInterface3 {
  /**
   * Call signature
   * @param x - the parameter
   */
  (x: number): number;

  /**
   * Construct signature
   */
  new (): IDocInterface1;

  /**
   * Indexer
   * @param x - the parameter
   */
  [x: string]: string;

  /**
   * ECMAScript symbol
   */
  [EcmaSmbols.example]: string;

  /**
   * A quoted identifier with redundant quotes.
   */
  // prettier-ignore
  "redundantQuotes": string;

  /**
   * An identifier that does need quotes.  It misleadingly looks like an ECMAScript symbol.
   */
  // prettier-ignore
  "[not.a.symbol]": string;
}

/**
 * Generic class.
 * @public
 */
export class Generic<T> {}

/**
 * Type union in an interface.
 * @public
 * {@docCategory DocClass1}
 */
export interface IDocInterface4 {
  /**
   * a union type
   */
  stringOrNumber: string | number;

  /**
   * a union type with a function
   */
  numberOrFunction: number | (() => number);

  /**
   * make sure html entities are escaped in tables.
   */
  generic: Generic<number>;
  /**
   * Test newline rendering when code blocks are used in tables
   */
  Context: ({ children }: { children: string }) => boolean;
}

/**
 * This is an example class.
 *
 * @remarks
 * {@link DocClass1.(exampleFunction:1)|Link to overload 1}
 *
 * {@link DocClass1.(exampleFunction:2)|Link to overload 2}
 *
 * @public
 * {@docCategory DocClass1}
 */
export class DocClass1 extends DocBaseClass implements IDocInterface1, IDocInterface2 {
  /**
   * An internal class constructor.
   * @internal
   */
  public constructor(name: string) {
    super();
  }

  /**
   * This is an overloaded function.
   * @param a - the first string
   * @param b - the second string
   *
   * @throws `Error`
   *  The first throws line
   *
   * @throws The second throws line
   */
  exampleFunction(a: string, b: string): string;

  /**
   * This is also an overloaded function.
   * @param x - the number
   */
  exampleFunction(x: number): number;

  public exampleFunction(x: number | string, y?: string): string | number {
    return x;
  }

  /**
   * This is a function with an optional parameter.
   * @param x - the number
   */
  public optionalParamFunction(x?: number): void {}

  public get readonlyProperty(): string {
    return 'hello';
  }

  public get writeableProperty(): string {
    return 'hello';
  }
  public set writeableProperty(value: string) {}

  /**
   * This event is fired whenever the object is modified.
   * @eventProperty
   */
  public readonly modifiedEvent: SystemEvent;

  /**
   * This event should have been marked as readonly.
   * @eventProperty
   */
  public malformedEvent: SystemEvent;

  /**
   * This is a regular property that happens to use the SystemEvent type.
   */
  public regularProperty: SystemEvent;

  /**
   * This is an optional property.
   */
  public optionalProperty?: number;

  /**
   * This is a property with a default value.
   */
  public propertyWithDefault = true;

  /**
   * An example with tables:
   * @remarks
   * <table>
   *  <tr>
   *    <td>John</td>
   *    <td>Doe</td>
   *  </tr>
   * </table>
   */
  tableExample(): void {}

  /**
   * Example: "\{ \\"maxItemsToShow\\": 123 \}"
   *
   * The regular expression used to validate the constraints is /^[a-zA-Z0-9\\-_]+$/
   */
  interestingEdgeCases(): void {}

  /**
   * @deprecated Use `otherThing()` instead.
   */
  public deprecatedExample(): void {}

  /**
   * Returns the sum of two numbers.
   *
   * @remarks
   * This illustrates usage of the `@example` block tag.
   *
   * @param x - the first number to add
   * @param y - the second number to add
   * @returns the sum of the two numbers
   *
   * @example
   * Here's a simple example:
   * ```
   * // Prints "2":
   * console.log(DocClass1.sumWithExample(1,1));
   * ```
   * @example
   * Here's an example with negative numbers:
   * ```
   * // Prints "0":
   * console.log(DocClass1.sumWithExample(1,-1));
   * ```
   */
  public static sumWithExample(x: number, y: number): number {
    return x + y;
  }
}

/**
 * Interface without inline tag to test custom TOC
 * @public
 */
export interface IDocInterface5 {
  /**
   * Property of type string that does something
   */
  regularProperty: string;
}

/**
 * Interface without inline tag to test custom TOC with injection
 * @public
 */
export interface IDocInterface6 {
  /**
   * Property of type number that does something
   */
  regularProperty: number;
}

/**
 * Interface for testing complex properties
 * @public
 */
export interface IDocInterface6 {
  arrayProperty: IDocInterface1[];
  tupleProperty: [IDocInterface1, IDocInterface2];
  unionProperty: IDocInterface1 | IDocInterface2;
  intersectionProperty: IDocInterface1 & IDocInterface2;
  typeReferenceProperty: Generic<IDocInterface1>;
  genericReferenceMethod<T>(x: T): T;
}
/**
 * Interface for testing optional properties
 * @public
 */
export interface IDocInterface7 {
  /** Description of optionalField */
  optionalField?: boolean;

  // Missing description
  optionalUndocumentedField?: boolean;

  /** Description of optionalReadonlyField */
  readonly optionalReadonlyField?: boolean;

  /** Description of optionalMember */
  optionalMember?();
}

/**
 * Class that merges with interface
 *
 * @remarks
 * {@link (DocClassInterfaceMerge:class)|Link to class}
 *
 * {@link (DocClassInterfaceMerge:interface)|Link to interface}
 *
 * @public
 */
export class DocClassInterfaceMerge {}

/**
 * Interface that merges with class
 * @public
 */
export interface DocClassInterfaceMerge {}
