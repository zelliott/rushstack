type SomeBaseType = number;

class BaseClass {
  someProp?: SomeBaseType;
}

/** @public */
export class SubClass extends BaseClass {}

interface BaseInterface {}
interface BaseInterface2 {}

/** @public */
export interface SubInterface extends BaseInterface, BaseInterface2 {}

type SomeType = number;

/** @public */
export function someFunction(x: SomeType): void {}

type SomeInternalType = string;
class SomeInternalClass {}

/** @public */
export class SomeClass {
  someProp?: SomeType;

  private anotherProp?: SomeInternalType;
  private yetAnotherProp?: SomeInternalClass;
}
