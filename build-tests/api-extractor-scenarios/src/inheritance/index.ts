// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// ---

// This class should be included in the API report and API doc model despite
// not being exported because it is reachable via inheritance from `B`. It
// should also not be marked as a forgotten export.
class A {}

/** @public */
export class B extends A {}

// ---

// These declarations should be included in the API report and API doc model despite
// not being exported because they are reachable via inheritance from `E`. They
// should also not be marked as a forgotten export.
class C<T> {}
type D = boolean;

/** @public */
export class E extends C<D> {}

// ---

// This class should also be included in the API report and API doc model for
// the same reason as that for `A` above. However, it should be marked as a
// forgotten export due to `ExtendsIncludedButForgottenExport.prop`.
class IncludedButForgottenExport {}

/** @public */
export class ExtendsIncludedButForgottenExport extends IncludedButForgottenExport {
  prop: IncludedButForgottenExport;
}

// ---

// This class should not be included in the API report or API doc model. It should
// also be marked as a forgotten export due to `someFunction`.
class Unexported {}

/** @public */
export function someFunction(): Unexported {
  return new Unexported();
}

// ---

// These declarations should be included in the API report and API doc model
// for the same reasons as that for `A` above. They should also not be marked
// as forgotten exports.
interface IA {}
interface IA {}
type IB = {};
class IC {}

/** @public */
export interface ID extends IA, IB, IC {}

// ---

// Each of the merged declarations below should be included in the API report
// and API doc model. They should also not be marked as forgotten exports.
class Merged {}
namespace Merged {
  export function innerFunction(): void {}
}

/** @public */
export class ExtendsMerged extends Merged {}

// ---

// This namespace and both child classes should be included in the API report and API doc
// model. They should also not be marked as forgotten exports.
namespace SomeNamespace {
  export class Extended {}
  export class NotExtended {}
}

/** @public */
export class ExtendsClassWithinNamespace extends SomeNamespace.Extended {}

// ---

/** @public */
export namespace AnotherNamespace {
  // This class should be included in the API report and API doc model despite
  // not being exported because it is reachable via inheritance from `B`. It
  // should also not be marked as a forgotten export.
  class A {}

  /** @public */
  export class B extends A {}
}

// ---

// This class should be included in the API report and API doc model, and both declarations
// should be marked as forgotten exports.
type ForgottenExport = number;
class UnexportedWithForgottenExports {
  prop: ForgottenExport;
  anotherProp: UnexportedWithForgottenExports;
}

/** @public */
export class ExtendsUnexportedWithForgottenExports extends UnexportedWithForgottenExports {}
