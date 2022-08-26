// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
interface Options {
  name: string;
  color: 'red' | 'blue';
}

export { Options as OptionsRenamed };

/** @public */
export class Item {
  options: Options;
}
