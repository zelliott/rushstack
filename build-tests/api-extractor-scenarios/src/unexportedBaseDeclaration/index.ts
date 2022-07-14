import { type } from 'os';

/**
 * This class should be included in the API report and API doc model despite
 * not being exported because it is reachable via inheritance from `B`. It
 * should also not be marked as a forgotten export.
 */
class A {}

/** @public */
export class B extends A {}

/**
 * This class should also be included in the API report and API doc model for
 * the same reason as that for `A` above. However, it should be marked as a
 * forgotten export due to `D.c`.
 */
class C {}

/** @public */
export class D extends C {
  c: C;
}

/**
 * This class should not be included in the API report or API doc model. It should
 * also be marked as a forgotten export due to `someFunction`.
 */
class E {}

/** @public */
export function someFunction(): E {
  return new E();
}

/**
 * These declarations should be included in the API report and API doc model
 * for the same reasons as that for `A` above. They should also not be marked
 * as forgotten exports.
 */
interface AnotherA {}
interface AnotherA {}
type AnotherB = {};
class AnotherC {}

/** @public */
export interface AnotherD extends AnotherA, AnotherB, AnotherC {}
