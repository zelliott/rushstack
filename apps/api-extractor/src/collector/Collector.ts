// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';
import { PackageJsonLookup, Sort, InternalError } from '@rushstack/node-core-library';
import { ReleaseTag } from '@microsoft/api-extractor-model';

import { ExtractorMessageId } from '../api/ExtractorMessageId';

import { CollectorEntity } from './CollectorEntity';
import { AstSymbolTable } from '../analyzer/AstSymbolTable';
import { AstEntity, AstEntityReferenceKind } from '../analyzer/AstEntity';
import { AstModule, AstModuleExportInfo } from '../analyzer/AstModule';
import { AstSymbol } from '../analyzer/AstSymbol';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';
import { WorkingPackage } from './WorkingPackage';
import { PackageDocComment } from '../aedoc/PackageDocComment';
import { DeclarationMetadata, InternalDeclarationMetadata } from './DeclarationMetadata';
import { ApiItemMetadata, IApiItemMetadataOptions } from './ApiItemMetadata';
import { SymbolMetadata } from './SymbolMetadata';
import { TypeScriptInternals, IGlobalVariableAnalyzer } from '../analyzer/TypeScriptInternals';
import { MessageRouter } from './MessageRouter';
import { AstReferenceResolver } from '../analyzer/AstReferenceResolver';
import { ExtractorConfig } from '../api/ExtractorConfig';
import { AstNamespaceImport } from '../analyzer/AstNamespaceImport';
import { AstImport } from '../analyzer/AstImport';

/**
 * Options for Collector constructor.
 */
export interface ICollectorOptions {
  /**
   * Configuration for the TypeScript compiler.  The most important options to set are:
   *
   * - target: ts.ScriptTarget.ES5
   * - module: ts.ModuleKind.CommonJS
   * - moduleResolution: ts.ModuleResolutionKind.NodeJs
   * - rootDir: inputFolder
   */
  program: ts.Program;

  messageRouter: MessageRouter;

  extractorConfig: ExtractorConfig;
}

/**
 * The `Collector` manages the overall data set that is used by `ApiModelGenerator`,
 * `DtsRollupGenerator`, and `ApiReportGenerator`.  Starting from the working package's entry point,
 * the `Collector` collects all exported symbols, determines how to import any symbols they reference,
 * assigns unique names, and sorts everything into a normalized alphabetical ordering.
 */
export class Collector {
  public readonly program: ts.Program;
  public readonly typeChecker: ts.TypeChecker;
  public readonly globalVariableAnalyzer: IGlobalVariableAnalyzer;
  public readonly astSymbolTable: AstSymbolTable;
  public readonly astReferenceResolver: AstReferenceResolver;

  public readonly packageJsonLookup: PackageJsonLookup;
  public readonly messageRouter: MessageRouter;

  public readonly workingPackage: WorkingPackage;

  public readonly extractorConfig: ExtractorConfig;

  /**
   * The `ExtractorConfig.bundledPackages` names in a set.
   */
  public readonly bundledPackageNames: ReadonlySet<string>;

  private readonly _program: ts.Program;

  private readonly _tsdocParser: tsdoc.TSDocParser;

  private _astEntryPoint: AstModule | undefined;

  private readonly _entities: CollectorEntity[] = [];
  private readonly _entitiesByAstEntity: Map<AstEntity, CollectorEntity> = new Map<
    AstEntity,
    CollectorEntity
  >();

  private readonly _starExportedExternalModulePaths: string[] = [];

  private readonly _dtsTypeReferenceDirectives: Set<string> = new Set<string>();
  private readonly _dtsLibReferenceDirectives: Set<string> = new Set<string>();

  // Used by getOverloadIndex()
  private readonly _cachedOverloadIndexesByDeclaration: Map<AstDeclaration, number>;

  public constructor(options: ICollectorOptions) {
    this.packageJsonLookup = new PackageJsonLookup();

    this._program = options.program;
    this.extractorConfig = options.extractorConfig;

    const entryPointSourceFile: ts.SourceFile | undefined = options.program.getSourceFile(
      this.extractorConfig.mainEntryPointFilePath
    );

    if (!entryPointSourceFile) {
      throw new Error('Unable to load file: ' + this.extractorConfig.mainEntryPointFilePath);
    }

    if (!this.extractorConfig.packageFolder || !this.extractorConfig.packageJson) {
      // TODO: We should be able to analyze projects that don't have any package.json.
      // The ExtractorConfig class is already designed to allow this.
      throw new Error('Unable to find a package.json file for the project being analyzed');
    }

    this.workingPackage = new WorkingPackage({
      packageFolder: this.extractorConfig.packageFolder,
      packageJson: this.extractorConfig.packageJson,
      entryPointSourceFile
    });

    this.messageRouter = options.messageRouter;

    this.program = options.program;
    this.typeChecker = options.program.getTypeChecker();
    this.globalVariableAnalyzer = TypeScriptInternals.getGlobalVariableAnalyzer(this.program);

    this._tsdocParser = new tsdoc.TSDocParser(this.extractorConfig.tsdocConfiguration);

    this.bundledPackageNames = new Set<string>(this.extractorConfig.bundledPackages);

    this.astSymbolTable = new AstSymbolTable(
      this.program,
      this.typeChecker,
      this.packageJsonLookup,
      this.bundledPackageNames,
      this.messageRouter
    );
    this.astReferenceResolver = new AstReferenceResolver(this);

    this._cachedOverloadIndexesByDeclaration = new Map<AstDeclaration, number>();
  }

  /**
   * Returns a list of names (e.g. "example-library") that should appear in a reference like this:
   *
   * ```
   * /// <reference types="example-library" />
   * ```
   */
  public get dtsTypeReferenceDirectives(): ReadonlySet<string> {
    return this._dtsTypeReferenceDirectives;
  }

  /**
   * A list of names (e.g. "runtime-library") that should appear in a reference like this:
   *
   * ```
   * /// <reference lib="runtime-library" />
   * ```
   */
  public get dtsLibReferenceDirectives(): ReadonlySet<string> {
    return this._dtsLibReferenceDirectives;
  }

  public get entities(): ReadonlyArray<CollectorEntity> {
    return this._entities;
  }

  /**
   * A list of module specifiers (e.g. `"@rushstack/node-core-library/lib/FileSystem"`) that should be emitted
   * as star exports (e.g. `export * from "@rushstack/node-core-library/lib/FileSystem"`).
   */
  public get starExportedExternalModulePaths(): ReadonlyArray<string> {
    return this._starExportedExternalModulePaths;
  }

  /**
   * Perform the analysis.
   */
  public analyze(): void {
    if (this._astEntryPoint) {
      throw new Error('DtsRollupGenerator.analyze() was already called');
    }

    // This runs a full type analysis, and then augments the Abstract Syntax Tree (i.e. declarations)
    // with semantic information (i.e. symbols).  The "diagnostics" are a subset of the everyday
    // compile errors that would result from a full compilation.
    for (const diagnostic of this._program.getSemanticDiagnostics()) {
      this.messageRouter.addCompilerDiagnostic(diagnostic);
    }

    const sourceFiles: readonly ts.SourceFile[] = this.program.getSourceFiles();

    if (this.messageRouter.showDiagnostics) {
      this.messageRouter.logDiagnosticHeader('Root filenames');
      for (const fileName of this.program.getRootFileNames()) {
        this.messageRouter.logDiagnostic(fileName);
      }
      this.messageRouter.logDiagnosticFooter();

      this.messageRouter.logDiagnosticHeader('Files analyzed by compiler');
      for (const sourceFile of sourceFiles) {
        this.messageRouter.logDiagnostic(sourceFile.fileName);
      }
      this.messageRouter.logDiagnosticFooter();
    }

    // We can throw this error earlier in CompilerState.ts, but intentionally wait until after we've logged the
    // associated diagnostic message above to make debugging easier for developers.
    // Typically there will be many such files -- to avoid too much noise, only report the first one.
    const badSourceFile: ts.SourceFile | undefined = sourceFiles.find(
      ({ fileName }) => !ExtractorConfig.hasDtsFileExtension(fileName)
    );
    if (badSourceFile) {
      this.messageRouter.addAnalyzerIssueForPosition(
        ExtractorMessageId.WrongInputFileType,
        'Incorrect file type; API Extractor expects to analyze compiler outputs with the .d.ts file extension. ' +
          'Troubleshooting tips: https://api-extractor.com/link/dts-error',
        badSourceFile,
        0
      );
    }

    // Build the entry point
    const entryPointSourceFile: ts.SourceFile = this.workingPackage.entryPointSourceFile;

    const astEntryPoint: AstModule =
      this.astSymbolTable.fetchAstModuleFromWorkingPackage(entryPointSourceFile);
    this._astEntryPoint = astEntryPoint;

    const packageDocCommentTextRange: ts.TextRange | undefined = PackageDocComment.tryFindInSourceFile(
      entryPointSourceFile,
      this
    );

    if (packageDocCommentTextRange) {
      const range: tsdoc.TextRange = tsdoc.TextRange.fromStringRange(
        entryPointSourceFile.text,
        packageDocCommentTextRange.pos,
        packageDocCommentTextRange.end
      );

      this.workingPackage.tsdocParserContext = this._tsdocParser.parseRange(range);

      this.messageRouter.addTsdocMessages(this.workingPackage.tsdocParserContext, entryPointSourceFile);

      this.workingPackage.tsdocComment = this.workingPackage.tsdocParserContext!.docComment;
    }

    const exportedAstEntities: AstEntity[] = [];

    // Create a CollectorEntity for each top-level export

    const astModuleExportInfo: AstModuleExportInfo =
      this.astSymbolTable.fetchAstModuleExportInfo(astEntryPoint);

    for (const [exportName, astEntity] of astModuleExportInfo.exportedLocalEntities) {
      this._createCollectorEntity(astEntity, exportName);

      exportedAstEntities.push(astEntity);
    }

    // Create a CollectorEntity for each indirectly referenced export.
    // Note that we do this *after* the above loop, so that references to exported AstSymbols
    // are encountered first as exports.
    const alreadySeenAstEntities: Set<AstSymbol> = new Set<AstSymbol>();
    for (const exportedAstEntity of exportedAstEntities) {
      this._createEntityForIndirectReferences(exportedAstEntity, alreadySeenAstEntities);

      if (exportedAstEntity instanceof AstSymbol) {
        this.fetchSymbolMetadata(exportedAstEntity);
      }
    }

    this._makeUniqueNames();

    for (const starExportedExternalModule of astModuleExportInfo.starExportedExternalModules) {
      if (starExportedExternalModule.externalModulePath !== undefined) {
        this._starExportedExternalModulePaths.push(starExportedExternalModule.externalModulePath);
      }
    }

    Sort.sortBy(this._entities, (x) => x.getSortKey());
    Sort.sortSet(this._dtsTypeReferenceDirectives);
    Sort.sortSet(this._dtsLibReferenceDirectives);
    this._starExportedExternalModulePaths.sort();
  }

  /**
   * For a given ts.Identifier that is part of an AstSymbol that we analyzed, return the CollectorEntity that
   * it refers to.  Returns undefined if it doesn't refer to anything interesting.
   * @remarks
   * Throws an Error if the ts.Identifier is not part of node tree that was analyzed.
   */
  public tryGetEntityForNode(identifier: ts.Identifier | ts.ImportTypeNode): CollectorEntity | undefined {
    const astEntity: AstEntity | undefined = this.astSymbolTable.tryGetEntityForNode(identifier);
    if (astEntity) {
      return this._entitiesByAstEntity.get(astEntity);
    }
    return undefined;
  }

  /**
   * Returns the associated `CollectorEntity` for the given `astEntity`, if one was created during analysis.
   */
  public tryGetCollectorEntity(astEntity: AstEntity): CollectorEntity | undefined {
    return this._entitiesByAstEntity.get(astEntity);
  }

  public fetchSymbolMetadata(astSymbol: AstSymbol): SymbolMetadata {
    if (astSymbol.symbolMetadata === undefined) {
      this._fetchSymbolMetadata(astSymbol);
    }
    return astSymbol.symbolMetadata as SymbolMetadata;
  }

  public fetchDeclarationMetadata(astDeclaration: AstDeclaration): DeclarationMetadata {
    if (astDeclaration.declarationMetadata === undefined) {
      // Fetching the SymbolMetadata always constructs the DeclarationMetadata
      this._fetchSymbolMetadata(astDeclaration.astSymbol);
    }
    return astDeclaration.declarationMetadata as DeclarationMetadata;
  }

  public fetchApiItemMetadata(astDeclaration: AstDeclaration): ApiItemMetadata {
    if (astDeclaration.apiItemMetadata === undefined) {
      // Fetching the SymbolMetadata always constructs the ApiItemMetadata
      this._fetchSymbolMetadata(astDeclaration.astSymbol);
    }
    return astDeclaration.apiItemMetadata as ApiItemMetadata;
  }

  public tryFetchMetadataForAstEntity(astEntity: AstEntity): SymbolMetadata | undefined {
    if (astEntity instanceof AstSymbol) {
      return this.fetchSymbolMetadata(astEntity);
    }
    if (astEntity instanceof AstImport) {
      if (astEntity.astSymbol) {
        return this.fetchSymbolMetadata(astEntity.astSymbol);
      }
    }
    return undefined;
  }

  public isAncillaryDeclaration(astDeclaration: AstDeclaration): boolean {
    const declarationMetadata: DeclarationMetadata = this.fetchDeclarationMetadata(astDeclaration);
    return declarationMetadata.isAncillary;
  }

  public getNonAncillaryDeclarations(astSymbol: AstSymbol): ReadonlyArray<AstDeclaration> {
    const result: AstDeclaration[] = [];
    for (const astDeclaration of astSymbol.astDeclarations) {
      const declarationMetadata: DeclarationMetadata = this.fetchDeclarationMetadata(astDeclaration);
      if (!declarationMetadata.isAncillary) {
        result.push(astDeclaration);
      }
    }
    return result;
  }

  /**
   * Removes the leading underscore, for example: "_Example" --> "example*Example*_"
   *
   * @remarks
   * This causes internal definitions to sort alphabetically case-insensitive, then case-sensitive, and
   * initially ignoring the underscore prefix, while still deterministically comparing it.
   * The star is used as a delimiter because it is not a legal identifier character.
   */
  public static getSortKeyIgnoringUnderscore(identifier: string | undefined): string {
    if (!identifier) return '';

    let parts: string[];

    if (identifier[0] === '_') {
      const withoutUnderscore: string = identifier.substr(1);
      parts = [withoutUnderscore.toLowerCase(), '*', withoutUnderscore, '*', '_'];
    } else {
      parts = [identifier.toLowerCase(), '*', identifier];
    }

    return parts.join('');
  }

  /**
   * For function-like signatures, this returns the TSDoc "overload index" which can be used to identify
   * a specific overload.
   */
  public getOverloadIndex(astDeclaration: AstDeclaration): number {
    const allDeclarations: ReadonlyArray<AstDeclaration> = astDeclaration.astSymbol.astDeclarations;
    if (allDeclarations.length === 1) {
      return 1; // trivial case
    }

    let overloadIndex: number | undefined = this._cachedOverloadIndexesByDeclaration.get(astDeclaration);

    if (overloadIndex === undefined) {
      // TSDoc index selectors are positive integers counting from 1
      let nextIndex: number = 1;
      for (const other of allDeclarations) {
        // Filter out other declarations that are not overloads.  For example, an overloaded function can also
        // be a namespace.
        if (other.declaration.kind === astDeclaration.declaration.kind) {
          this._cachedOverloadIndexesByDeclaration.set(other, nextIndex);
          ++nextIndex;
        }
      }
      overloadIndex = this._cachedOverloadIndexesByDeclaration.get(astDeclaration);
    }

    if (overloadIndex === undefined) {
      // This should never happen
      throw new InternalError('Error calculating overload index for declaration');
    }

    return overloadIndex;
  }

  private _createCollectorEntity(
    astEntity: AstEntity,
    exportedName: string | undefined,
    consumableViaInheritance: boolean = false
  ): CollectorEntity {
    let entity: CollectorEntity | undefined = this._entitiesByAstEntity.get(astEntity);

    if (!entity) {
      entity = new CollectorEntity(astEntity);

      this._entitiesByAstEntity.set(astEntity, entity);
      this._entities.push(entity);
      this._collectReferenceDirectives(astEntity);
    }

    if (exportedName) {
      entity.addExportName(exportedName);
    }

    if (consumableViaInheritance) {
      entity.consumableViaInheritance = true;
    }

    return entity;
  }

  private _createEntityForIndirectReferences(
    astEntity: AstEntity,
    alreadySeenAstEntities: Set<AstEntity>
  ): void {
    if (alreadySeenAstEntities.has(astEntity)) {
      return;
    }
    alreadySeenAstEntities.add(astEntity);

    if (astEntity instanceof AstSymbol) {
      astEntity.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
        for (const astEntityReference of astDeclaration.astEntityReferences) {
          const referencedAstEntity: AstEntity = astEntityReference.astEntity;
          const referenceKind: AstEntityReferenceKind = astEntityReference.kind;

          // TODO: Do AstNamespaceImports need this logic? Do AstImports even need this logic?
          const entity: CollectorEntity | undefined = this._entitiesByAstEntity.get(astEntity);
          if (!entity) {
            // This should never happen.
            throw new Error();
          }
          const consumableViaInheritance: boolean =
            entity.consumable && referenceKind === AstEntityReferenceKind.Inheritance;

          if (referencedAstEntity instanceof AstSymbol) {
            // We only create collector entities for root-level symbols.
            // For example, if a symbols is nested inside a namespace, only the root-level namespace
            // get a collector entity
            if (referencedAstEntity.parentAstSymbol === undefined) {
              this._createCollectorEntity(referencedAstEntity, undefined, consumableViaInheritance);
            }
          } else {
            this._createCollectorEntity(referencedAstEntity, undefined, consumableViaInheritance);
          }

          this._createEntityForIndirectReferences(referencedAstEntity, alreadySeenAstEntities);
        }
      });
    }

    if (astEntity instanceof AstNamespaceImport) {
      const astModuleExportInfo: AstModuleExportInfo = astEntity.fetchAstModuleExportInfo(this);

      for (const exportedEntity of astModuleExportInfo.exportedLocalEntities.values()) {
        // Create a CollectorEntity for each top-level export of AstImportInternal entity
        const entity: CollectorEntity = this._createCollectorEntity(exportedEntity, undefined);
        entity.addAstNamespaceImports(astEntity);

        this._createEntityForIndirectReferences(exportedEntity, alreadySeenAstEntities);
      }
    }
  }

  /**
   * Ensures a unique name for each item in the package typings file.
   */
  private _makeUniqueNames(): void {
    // The following examples illustrate the nameForEmit heuristics:
    //
    // Example 1:
    //   class X { } <--- nameForEmit should be "A" to simplify things and reduce possibility of conflicts
    //   export { X as A };
    //
    // Example 2:
    //   class X { } <--- nameForEmit should be "X" because choosing A or B would be nondeterministic
    //   export { X as A };
    //   export { X as B };
    //
    // Example 3:
    //   class X { } <--- nameForEmit should be "X_1" because Y has a stronger claim to the name
    //   export { X as A };
    //   export { X as B };
    //   class Y { } <--- nameForEmit should be "X"
    //   export { Y as X };

    // Set of names that should NOT be used when generating a unique nameForEmit
    const usedNames: Set<string> = new Set<string>();

    // First collect the names of explicit package exports, and perform a sanity check.
    for (const entity of this._entities) {
      for (const exportName of entity.exportNames) {
        if (usedNames.has(exportName)) {
          // This should be impossible
          throw new InternalError(`A package cannot have two exports with the name "${exportName}"`);
        }
        usedNames.add(exportName);
      }
    }

    // Ensure that each entity has a unique nameForEmit
    for (const entity of this._entities) {
      // What name would we ideally want to emit it as?
      let idealNameForEmit: string;

      // If this entity is exported exactly once, then we prefer the exported name
      if (
        entity.singleExportName !== undefined &&
        entity.singleExportName !== ts.InternalSymbolName.Default
      ) {
        idealNameForEmit = entity.singleExportName;
      } else {
        // otherwise use the local name
        idealNameForEmit = entity.astEntity.localName;
      }

      if (idealNameForEmit.includes('.')) {
        // For an ImportType with a namespace chain, only the top namespace is imported.
        idealNameForEmit = idealNameForEmit.split('.')[0];
      }

      // If the idealNameForEmit happens to be the same as one of the exports, then we're safe to use that...
      if (entity.exportNames.has(idealNameForEmit)) {
        // ...except that if it conflicts with a global name, then the global name wins
        if (!this.globalVariableAnalyzer.hasGlobalName(idealNameForEmit)) {
          // ...also avoid "default" which can interfere with "export { default } from 'some-module;'"
          if (idealNameForEmit !== 'default') {
            entity.nameForEmit = idealNameForEmit;
            continue;
          }
        }
      }

      // Generate a unique name based on idealNameForEmit
      let suffix: number = 1;
      let nameForEmit: string = idealNameForEmit;

      // Choose a name that doesn't conflict with usedNames or a global name
      while (
        nameForEmit === 'default' ||
        usedNames.has(nameForEmit) ||
        this.globalVariableAnalyzer.hasGlobalName(nameForEmit)
      ) {
        nameForEmit = `${idealNameForEmit}_${++suffix}`;
      }
      entity.nameForEmit = nameForEmit;
      usedNames.add(nameForEmit);
    }
  }

  private _fetchSymbolMetadata(astSymbol: AstSymbol): void {
    if (astSymbol.symbolMetadata) {
      return;
    }

    // When we solve an astSymbol, then we always also solve all of its parents and all of its declarations.
    // The parent is solved first.
    if (astSymbol.parentAstSymbol && astSymbol.parentAstSymbol.symbolMetadata === undefined) {
      this._fetchSymbolMetadata(astSymbol.parentAstSymbol);
    }

    // Construct the DeclarationMetadata objects, and detect any ancillary declarations
    this._calculateDeclarationMetadataForDeclarations(astSymbol);

    // Calculate the ApiItemMetadata objects
    for (const astDeclaration of astSymbol.astDeclarations) {
      this._calculateApiItemMetadata(astDeclaration);
    }

    // The most public effectiveReleaseTag for all declarations
    let maxEffectiveReleaseTag: ReleaseTag = ReleaseTag.None;

    for (const astDeclaration of astSymbol.astDeclarations) {
      // We know we solved this above
      const apiItemMetadata: ApiItemMetadata = astDeclaration.apiItemMetadata as ApiItemMetadata;

      const effectiveReleaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;

      if (effectiveReleaseTag > maxEffectiveReleaseTag) {
        maxEffectiveReleaseTag = effectiveReleaseTag;
      }
    }

    // Update this last when we're sure no exceptions were thrown
    astSymbol.symbolMetadata = new SymbolMetadata({
      maxEffectiveReleaseTag
    });
  }

  private _calculateDeclarationMetadataForDeclarations(astSymbol: AstSymbol): void {
    // Initialize DeclarationMetadata for each declaration
    for (const astDeclaration of astSymbol.astDeclarations) {
      if (astDeclaration.declarationMetadata) {
        throw new InternalError(
          'AstDeclaration.declarationMetadata is not expected to have been initialized yet'
        );
      }

      const metadata: InternalDeclarationMetadata = new InternalDeclarationMetadata();
      metadata.tsdocParserContext = this._parseTsdocForAstDeclaration(astDeclaration);

      astDeclaration.declarationMetadata = metadata;
    }

    // Detect ancillary declarations
    for (const astDeclaration of astSymbol.astDeclarations) {
      // For a getter/setter pair, make the setter ancillary to the getter
      if (astDeclaration.declaration.kind === ts.SyntaxKind.SetAccessor) {
        let foundGetter: boolean = false;
        for (const getterAstDeclaration of astDeclaration.astSymbol.astDeclarations) {
          if (getterAstDeclaration.declaration.kind === ts.SyntaxKind.GetAccessor) {
            // Associate it with the getter
            this._addAncillaryDeclaration(getterAstDeclaration, astDeclaration);

            foundGetter = true;
          }
        }

        if (!foundGetter) {
          this.messageRouter.addAnalyzerIssue(
            ExtractorMessageId.MissingGetter,
            `The property "${astDeclaration.astSymbol.localName}" has a setter but no getter.`,
            astDeclaration
          );
        }
      }
    }
  }

  private _addAncillaryDeclaration(
    mainAstDeclaration: AstDeclaration,
    ancillaryAstDeclaration: AstDeclaration
  ): void {
    const mainMetadata: InternalDeclarationMetadata =
      mainAstDeclaration.declarationMetadata as InternalDeclarationMetadata;
    const ancillaryMetadata: InternalDeclarationMetadata =
      ancillaryAstDeclaration.declarationMetadata as InternalDeclarationMetadata;

    if (mainMetadata.ancillaryDeclarations.indexOf(ancillaryAstDeclaration) >= 0) {
      return; // already added
    }

    if (mainAstDeclaration.astSymbol !== ancillaryAstDeclaration.astSymbol) {
      throw new InternalError(
        'Invalid call to _addAncillaryDeclaration() because declarations do not' +
          ' belong to the same symbol'
      );
    }

    if (mainMetadata.isAncillary) {
      throw new InternalError(
        'Invalid call to _addAncillaryDeclaration() because the target is ancillary itself'
      );
    }

    if (ancillaryMetadata.isAncillary) {
      throw new InternalError(
        'Invalid call to _addAncillaryDeclaration() because source is already ancillary' +
          ' to another declaration'
      );
    }

    if (mainAstDeclaration.apiItemMetadata || ancillaryAstDeclaration.apiItemMetadata) {
      throw new InternalError(
        'Invalid call to _addAncillaryDeclaration() because the API item metadata' +
          ' has already been constructed'
      );
    }

    ancillaryMetadata.isAncillary = true;
    mainMetadata.ancillaryDeclarations.push(ancillaryAstDeclaration);
  }

  private _calculateApiItemMetadata(astDeclaration: AstDeclaration): void {
    const declarationMetadata: InternalDeclarationMetadata =
      astDeclaration.declarationMetadata as InternalDeclarationMetadata;
    if (declarationMetadata.isAncillary) {
      if (astDeclaration.declaration.kind === ts.SyntaxKind.SetAccessor) {
        if (declarationMetadata.tsdocParserContext) {
          this.messageRouter.addAnalyzerIssue(
            ExtractorMessageId.SetterWithDocs,
            `The doc comment for the property "${astDeclaration.astSymbol.localName}"` +
              ` must appear on the getter, not the setter.`,
            astDeclaration
          );
        }
      }

      // We never calculate ApiItemMetadata for an ancillary declaration; instead, it is assigned when
      // the main declaration is processed.
      return;
    }

    const options: IApiItemMetadataOptions = {
      declaredReleaseTag: ReleaseTag.None,
      effectiveReleaseTag: ReleaseTag.None,
      isEventProperty: false,
      isOverride: false,
      isSealed: false,
      isVirtual: false,
      isPreapproved: false,
      releaseTagSameAsParent: false
    };

    const parserContext: tsdoc.ParserContext | undefined = declarationMetadata.tsdocParserContext;
    if (parserContext) {
      const modifierTagSet: tsdoc.StandardModifierTagSet = parserContext.docComment.modifierTagSet;

      let declaredReleaseTag: ReleaseTag = ReleaseTag.None;
      let extraReleaseTags: boolean = false;

      if (modifierTagSet.isPublic()) {
        declaredReleaseTag = ReleaseTag.Public;
      }
      if (modifierTagSet.isBeta()) {
        if (declaredReleaseTag !== ReleaseTag.None) {
          extraReleaseTags = true;
        } else {
          declaredReleaseTag = ReleaseTag.Beta;
        }
      }
      if (modifierTagSet.isAlpha()) {
        if (declaredReleaseTag !== ReleaseTag.None) {
          extraReleaseTags = true;
        } else {
          declaredReleaseTag = ReleaseTag.Alpha;
        }
      }
      if (modifierTagSet.isInternal()) {
        if (declaredReleaseTag !== ReleaseTag.None) {
          extraReleaseTags = true;
        } else {
          declaredReleaseTag = ReleaseTag.Internal;
        }
      }

      if (extraReleaseTags) {
        if (!astDeclaration.astSymbol.isExternal) {
          // for now, don't report errors for external code
          this.messageRouter.addAnalyzerIssue(
            ExtractorMessageId.ExtraReleaseTag,
            'The doc comment should not contain more than one release tag',
            astDeclaration
          );
        }
      }

      options.declaredReleaseTag = declaredReleaseTag;

      options.isEventProperty = modifierTagSet.isEventProperty();
      options.isOverride = modifierTagSet.isOverride();
      options.isSealed = modifierTagSet.isSealed();
      options.isVirtual = modifierTagSet.isVirtual();
      const preapprovedTag: tsdoc.TSDocTagDefinition | void =
        this.extractorConfig.tsdocConfiguration.tryGetTagDefinition('@preapproved');

      if (preapprovedTag && modifierTagSet.hasTag(preapprovedTag)) {
        // This feature only makes sense for potentially big declarations.
        switch (astDeclaration.declaration.kind) {
          case ts.SyntaxKind.ClassDeclaration:
          case ts.SyntaxKind.EnumDeclaration:
          case ts.SyntaxKind.InterfaceDeclaration:
          case ts.SyntaxKind.ModuleDeclaration:
            if (declaredReleaseTag === ReleaseTag.Internal) {
              options.isPreapproved = true;
            } else {
              this.messageRouter.addAnalyzerIssue(
                ExtractorMessageId.PreapprovedBadReleaseTag,
                `The @preapproved tag cannot be applied to "${astDeclaration.astSymbol.localName}"` +
                  ` without an @internal release tag`,
                astDeclaration
              );
            }
            break;
          default:
            this.messageRouter.addAnalyzerIssue(
              ExtractorMessageId.PreapprovedUnsupportedType,
              `The @preapproved tag cannot be applied to "${astDeclaration.astSymbol.localName}"` +
                ` because it is not a supported declaration type`,
              astDeclaration
            );
            break;
        }
      }
    }

    // This needs to be set regardless of whether or not a parserContext exists
    if (astDeclaration.parent) {
      const parentApiItemMetadata: ApiItemMetadata = this.fetchApiItemMetadata(astDeclaration.parent);
      options.effectiveReleaseTag =
        options.declaredReleaseTag === ReleaseTag.None
          ? parentApiItemMetadata.effectiveReleaseTag
          : options.declaredReleaseTag;

      options.releaseTagSameAsParent =
        parentApiItemMetadata.effectiveReleaseTag === options.effectiveReleaseTag;
    } else {
      options.effectiveReleaseTag = options.declaredReleaseTag;
    }

    if (options.effectiveReleaseTag === ReleaseTag.None) {
      if (!astDeclaration.astSymbol.isExternal) {
        // for now, don't report errors for external code
        // Don't report missing release tags for forgotten exports
        const astSymbol: AstSymbol = astDeclaration.astSymbol;
        const entity: CollectorEntity | undefined = this._entitiesByAstEntity.get(astSymbol.rootAstSymbol);
        if (entity && entity.consumable) {
          // We also don't report errors for the default export of an entry point, since its doc comment
          // isn't easy to obtain from the .d.ts file
          if (astSymbol.rootAstSymbol.localName !== '_default') {
            this.messageRouter.addAnalyzerIssue(
              ExtractorMessageId.MissingReleaseTag,
              `"${entity.astEntity.localName}" is exported by the package, but it is missing ` +
                `a release tag (@alpha, @beta, @public, or @internal)`,
              astSymbol
            );
          }

          options.effectiveReleaseTag = ReleaseTag.Public;
        }
      } else {
        options.effectiveReleaseTag = ReleaseTag.Public;
      }
    }

    const apiItemMetadata: ApiItemMetadata = new ApiItemMetadata(options);
    if (parserContext) {
      apiItemMetadata.tsdocComment = parserContext.docComment;
    }

    astDeclaration.apiItemMetadata = apiItemMetadata;

    // Lastly, share the result with any ancillary declarations
    for (const ancillaryDeclaration of declarationMetadata.ancillaryDeclarations) {
      ancillaryDeclaration.apiItemMetadata = apiItemMetadata;
    }
  }

  private _parseTsdocForAstDeclaration(astDeclaration: AstDeclaration): tsdoc.ParserContext | undefined {
    const declaration: ts.Declaration = astDeclaration.declaration;
    let nodeForComment: ts.Node = declaration;

    if (ts.isVariableDeclaration(declaration)) {
      // Variable declarations are special because they can be combined into a list.  For example:
      //
      // /** A */ export /** B */ const /** C */ x = 1, /** D **/ [ /** E */ y, z] = [3, 4];
      //
      // The compiler will only emit comments A and C in the .d.ts file, so in general there isn't a well-defined
      // way to document these parts.  API Extractor requires you to break them into separate exports like this:
      //
      // /** A */ export const x = 1;
      //
      // But _getReleaseTagForDeclaration() still receives a node corresponding to "x", so we need to walk upwards
      // and find the containing statement in order for getJSDocCommentRanges() to read the comment that we expect.
      const statement: ts.VariableStatement | undefined = TypeScriptHelpers.findFirstParent(
        declaration,
        ts.SyntaxKind.VariableStatement
      ) as ts.VariableStatement | undefined;
      if (statement !== undefined) {
        // For a compound declaration, fall back to looking for C instead of A
        if (statement.declarationList.declarations.length === 1) {
          nodeForComment = statement;
        }
      }
    }

    const sourceFileText: string = declaration.getSourceFile().text;
    const ranges: ts.CommentRange[] =
      TypeScriptInternals.getJSDocCommentRanges(nodeForComment, sourceFileText) || [];

    if (ranges.length === 0) {
      return undefined;
    }

    // We use the JSDoc comment block that is closest to the definition, i.e.
    // the last one preceding it
    const range: ts.TextRange = ranges[ranges.length - 1];

    const tsdocTextRange: tsdoc.TextRange = tsdoc.TextRange.fromStringRange(
      sourceFileText,
      range.pos,
      range.end
    );

    const parserContext: tsdoc.ParserContext = this._tsdocParser.parseRange(tsdocTextRange);

    this.messageRouter.addTsdocMessages(parserContext, declaration.getSourceFile(), astDeclaration);

    // We delete the @privateRemarks block as early as possible, to ensure that it never leaks through
    // into one of the output files.
    parserContext.docComment.privateRemarks = undefined;

    return parserContext;
  }

  private _collectReferenceDirectives(astEntity: AstEntity): void {
    if (astEntity instanceof AstSymbol) {
      const sourceFiles: ts.SourceFile[] = astEntity.astDeclarations.map((astDeclaration) =>
        astDeclaration.declaration.getSourceFile()
      );
      return this._collectReferenceDirectivesFromSourceFiles(sourceFiles);
    }

    if (astEntity instanceof AstNamespaceImport) {
      const sourceFiles: ts.SourceFile[] = [astEntity.astModule.sourceFile];
      return this._collectReferenceDirectivesFromSourceFiles(sourceFiles);
    }
  }

  private _collectReferenceDirectivesFromSourceFiles(sourceFiles: ts.SourceFile[]): void {
    const seenFilenames: Set<string> = new Set<string>();

    for (const sourceFile of sourceFiles) {
      if (sourceFile && sourceFile.fileName) {
        if (!seenFilenames.has(sourceFile.fileName)) {
          seenFilenames.add(sourceFile.fileName);

          for (const typeReferenceDirective of sourceFile.typeReferenceDirectives) {
            const name: string = sourceFile.text.substring(
              typeReferenceDirective.pos,
              typeReferenceDirective.end
            );
            this._dtsTypeReferenceDirectives.add(name);
          }

          for (const libReferenceDirective of sourceFile.libReferenceDirectives) {
            const name: string = sourceFile.text.substring(
              libReferenceDirective.pos,
              libReferenceDirective.end
            );
            this._dtsLibReferenceDirectives.add(name);
          }
        }
      }
    }
  }
}
