/**
 * Includes docs for `a`, `doA`, and its constructor.
 *
 * Does not include any docs for `B` or any other classes in the inheritance chain
 * as `B` is exported, and thus will surface those docs itself.
 *
 * @public
 */
export declare class A extends B {
    a: string;
    constructor(x: number);
    doA(): void;
}

/**
 * Includes docs for `b` (in `B`), `c`, `d`, `doB`, and the inherited constructor.
 *
 * `b` in `C` is ignored as it is "overridden" by `b` in `B`.
 * `doB` in `C` is ignored as it is "overridden" by `doB` in `B`.
 *
 * Given `C` and `D` aren't exported, docs for any inherited declarations are included
 * in the docs for `B`.
 *
 * @public
 */
export declare class B extends C {
    b: string;
    doB(): void;
}

declare class C extends D {
    b: string | number;
    c: string;
    constructor(x: boolean);
    doB(): void;
}

declare class D {
    d: string;
}

/**
 * Includes docs for `e` (in `E`), `f`, and `g`.
 *
 * @public
 */
export declare interface E extends F, G {
    e: string;
}

declare interface F {
    f: string;
}

declare interface G {
    g: string;
}

export { }
