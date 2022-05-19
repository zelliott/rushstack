declare class BaseClass {
    someProp?: SomeBaseType;
}

declare interface BaseInterface {
}

declare interface BaseInterface2 {
}

declare type SomeBaseType = number;

/** @public */
export declare class SomeClass {
    someProp?: SomeType;
    private anotherProp?;
    private yetAnotherProp?;
}

/** @public */
export declare function someFunction(x: SomeType): void;

declare type SomeType = number;

/** @public */
export declare class SubClass extends BaseClass {
}

/** @public */
export declare interface SubInterface extends BaseInterface, BaseInterface2 {
}

export { }
