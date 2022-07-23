// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../items/ApiItem';
import { DeserializerContext } from '../model/DeserializerContext';

/**
 * Constructor options for {@link (IApiExportedMixinOptions:interface)}.
 * @public
 */
export interface IApiExportedMixinOptions extends IApiItemOptions {
  isExported: boolean;
}

export interface IApiExportedMixinJson extends IApiItemJson {
  isExported: boolean;
}

const _isExported: unique symbol = Symbol('ApiExportedMixin._isExported');

/**
 * The mixin base class for API items that can be exported.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.  The non-abstract classes (e.g. `ApiClass`, `ApiEnum`, `ApiInterface`, etc.) use
 * TypeScript "mixin" functions (e.g. `ApiDeclaredItem`, `ApiItemContainerMixin`, etc.) to add various
 * features that cannot be represented as a normal inheritance chain (since TypeScript does not allow a child class
 * to extend more than one base class).  The "mixin" is a TypeScript merged declaration with three components:
 * the function that generates a subclass, an interface that describes the members of the subclass, and
 * a namespace containing static members of the class.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface ApiExportedMixin extends ApiItem {
  /**
   * Whether the declaration is exported.
   */
  readonly isExported: boolean;

  /** @override */
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

/**
 * Mixin function for {@link (ApiExportedMixin:interface)}.
 *
 * @param baseClass - The base class to be extended
 * @returns A child class that extends baseClass, adding the {@link (ApiExportedMixin:interface)} functionality.
 *
 * @public
 */
export function ApiExportedMixin<TBaseClass extends IApiItemConstructor>(
  baseClass: TBaseClass
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): TBaseClass & (new (...args: any[]) => ApiExportedMixin) {
  class MixedClass extends baseClass implements ApiExportedMixin {
    public [_isExported]: boolean;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public constructor(...args: any[]) {
      super(...args);

      const options: IApiExportedMixinOptions = args[0];
      this[_isExported] = options.isExported;
    }

    /** @override */
    public static onDeserializeInto(
      options: Partial<IApiExportedMixinOptions>,
      context: DeserializerContext,
      jsonObject: IApiExportedMixinJson
    ): void {
      baseClass.onDeserializeInto(options, context, jsonObject);

      options.isExported = jsonObject.isExported;
    }

    public get isExported(): boolean {
      return this[_isExported];
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiExportedMixinJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.isExported = this.isExported;
    }
  }

  return MixedClass;
}

/**
 * Static members for {@link (ApiExportedMixin:interface)}.
 * @public
 */
export namespace ApiExportedMixin {
  /**
   * A type guard that tests whether the specified `ApiItem` subclass extends the `ApiExportedMixin` mixin.
   *
   * @remarks
   *
   * The JavaScript `instanceof` operator cannot be used to test for mixin inheritance, because each invocation of
   * the mixin function produces a different subclass.  (This could be mitigated by `Symbol.hasInstance`, however
   * the TypeScript type system cannot invoke a runtime test.)
   */
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiExportedMixin {
    return apiItem.hasOwnProperty(_isExported);
  }
}
