/**
 * This class should be included in the API report and API doc model despite
 * not being exported because it is reachable via inheritance from `B`. It
 * should also not be marked as a forgotten export.
 */
declare class A {
}

/**
 * These declarations should be included in the API report and API doc model
 * for the same reasons as that for `A` above. They should also not be marked
 * as forgotten exports.
 */
declare interface AnotherA {
}

declare interface AnotherA {
}

declare type AnotherB = {};

declare class AnotherC {
}

/** @public */
export declare interface AnotherD extends AnotherA, AnotherB, AnotherC {
}

/** @public */
export declare class B extends A {
}

/**
 * This class should also be included in the API report and API doc model for
 * the same reason as that for `A` above. However, it should be marked as a
 * forgotten export due to `D.c`.
 */
declare class C {
}

/** @public */
export declare class D extends C {
    c: C;
}

/**
 * This class should not be included in the API report or API doc model. It should
 * also be marked as a forgotten export due to `someFunction`.
 */
declare class E {
}

/** @public */
export declare function someFunction(): E;

export { }
