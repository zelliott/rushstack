abstract class D {
  d: string;
}

class C extends D {
  b: string | number;
  c: string;

  constructor(x: boolean) {
    super();
  }

  doB(): void {}
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
export class B extends C {
  b: string;

  doB(): void {}
}

/**
 * Includes docs for `a`, `doA`, and its constructor.
 *
 * Does not include any docs for `B` or any other classes in the inheritance chain
 * as `B` is exported, and thus will surface those docs itself.
 *
 * @public
 */
export class A extends B {
  a: string;

  constructor(x: number) {
    super(false);
  }

  doA(): void {}
}

interface F {
  f: string;
}

interface G {
  g: string;
}

/**
 * Includes docs for `e` (in `E`), `f`, and `g`.
 *
 * @public
 */
export interface E extends F, G {
  e: string;
}
