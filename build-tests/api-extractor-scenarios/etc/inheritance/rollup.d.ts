declare class A {
}

/** @public */
export declare namespace AnotherNamespace {
    export class A {
    }
    /** @public */
    export class B extends A {
    }
        {};
}

/** @public */
export declare class B extends A {
}

/** @public */
export declare class ExtendsClassWithinNamespace extends SomeNamespace.Extended {
}

/** @public */
export declare class ExtendsIncludedButForgottenExport extends IncludedButForgottenExport {
    prop: IncludedButForgottenExport;
}

/** @public */
export declare class ExtendsMerged extends Merged {
}

declare interface IA {
}

declare interface IA {
}

declare type IB = {};

declare class IC {
}

/** @public */
export declare interface ID extends IA, IB, IC {
}

declare class IncludedButForgottenExport {
}

declare class Merged {
}

declare namespace Merged {
    function innerFunction(): void;
}

/** @public */
export declare function someFunction(): UnexportedClass;

declare namespace SomeNamespace {
    class Extended {
    }
    class NotExtended {
    }
}

declare class UnexportedClass {
}

export { }
