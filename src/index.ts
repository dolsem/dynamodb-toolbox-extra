import * as crypto from 'crypto';
import type { DocumentClient } from 'aws-sdk/clients/dynamodb';
import base64url from 'base64url';
import { Table as _Table, Entity as DynamoDBToolboxEntity } from 'dynamodb-toolbox';
import type { Table as TableKlass } from 'dynamodb-toolbox-types';
import type {
  PartitionKeyDefinition,
  PureAttributeDefinition,
  SortKeyDefinition,
  InferItemAttributeValue,
  AttributeDefinitions,
  EntityConstructor,
  Overlay,
  Writable,
  ParseAttributes,
  ParsedAttributes,
  InferItem,
  InferCompositePrimaryKey,
  $GetOptions,
  UpdateOptionsReturnValues,
  $UpdateOptions,
  UpdateItem,
  UpdateCustomParams,
} from 'dynamodb-toolbox-types/dist/classes/Entity';
import type { $PutOptions, PutItem, ShouldExecute, ShouldParse, TransactionOptions } from 'dynamodb-toolbox-types/dist/classes/Entity/types';
import type { DynamoDBTypes, TableDef, TransactWriteOptions } from 'dynamodb-toolbox-types/dist/classes/Table';
import type { If, FirstDefined } from 'dynamodb-toolbox-types/dist/lib/utils';
import type { A, O, B, U } from 'ts-toolbelt';
import type { EntityKlass } from './EntityKlass';

export const TableBase = _Table as unknown as typeof TableKlass;

export class Table<Name extends string, PartitionKey extends A.Key, SortKey extends A.Key> extends TableBase<Name, PartitionKey, SortKey> {
  async transactWrite<ReturnStored extends boolean | undefined = undefined>(
    items: Array<DocumentClient.TransactWriteItem & { _entity?: Entity<any, any, any> }>,
    options?: TransactWriteOptions & { returnStored?: boolean },
    params?: Partial<DocumentClient.TransactWriteItemsInput>
  ): Promise<DocumentClient.TransactWriteItemsInput | (
    DocumentClient.TransactWriteItemsOutput
    & If<A.Equals<ReturnStored, true>, { PutItems: unknown[] }, {}>
  )> {
    const result = await super.transactWrite(items, options, params);
    if (Object.prototype.hasOwnProperty.call(result, 'TransactItems')) {
      return result as DocumentClient.TransactWriteItemsInput;
    }
    if (options?.returnStored) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (result as any).PutItems = items.map((x) => x.Put && (x._entity ? x._entity.parse(x.Put) : x.Put));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-return
    return result as any;
  }
}

let salt: string | Buffer | NodeJS.TypedArray | DataView;
export const setSalt = (v: typeof salt) => { salt = v; };
const checkSalt = () => {
  if (!salt) throw new Error('[DynamoDB Toolbox Extra] Must set salt before using hash ids');
  return true;
}
const hash = (value: object) => checkSalt()
  && base64url.encode(crypto.createCipheriv('rc4', salt, '').update(JSON.stringify(value), 'utf8'));
const dehash = (value: string): unknown => checkSalt()
  && JSON.parse(crypto.createDecipheriv('rc4', salt, '').update(base64url.toBuffer(value)).toString());

const _Entity = DynamoDBToolboxEntity as unknown as typeof EntityKlass;

type FixedAttributeDefinition = Omit<PureAttributeDefinition, 'default'> & { default?: unknown };
type NonKeyAttribute = DynamoDBTypes | FixedAttributeDefinition;
type NonKeyAttributes = Record<string, NonKeyAttribute>;
type KeyAttributes = Record<string, SortKeyDefinition | PartitionKeyDefinition>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface IndexKeyAttribute { hidden: true, default: (d: any) => string }
type IndexKeyAttributes = Record<string, IndexKeyAttribute>;

type IsOptional<NKA extends NonKeyAttributes, K extends keyof NKA> = NKA[K] extends FixedAttributeDefinition
  ? (NKA[K]['required'] extends true ? false : true)
  : true;
type HasDefault<NKA extends NonKeyAttributes, K extends keyof NKA> = NKA[K] extends FixedAttributeDefinition
  ? O.Has<NKA[K], 'default'> extends 1 ? true : false
  : false;
type Required<NKA extends NonKeyAttributes> = { [K in keyof NKA]: (IsOptional<NKA, K> extends true ? never : K) }[keyof NKA];
type AlwaysPresent<NKA extends NonKeyAttributes> = { [K in keyof NKA]: (HasDefault<NKA, K> extends true ? K : never) }[keyof NKA];
type MaybeAbsent<NKA extends NonKeyAttributes> = {
  [K in keyof NKA]: (IsOptional<NKA, K> extends true ? (HasDefault<NKA, K> extends true ? never : K) : never)
}[keyof NKA];

class AttributesBase<NKA extends NonKeyAttributes, KA extends KeyAttributes, IKA extends IndexKeyAttributes> {
  constructor(public nonKeyAttributes: NKA, public keys: KA, public indexKeys: IKA) { }

  get definitions(): NKA & KA & IKA {
    return Object.assign({}, this.nonKeyAttributes, this.keys, this.indexKeys);
  }
}

class AttributesWithoutIndexKeys<NKA extends NonKeyAttributes, KA extends KeyAttributes> extends AttributesBase<NKA, KA, {}> {
  addIndexKeys<
    D extends Record<string, (Required<NKA> | AlwaysPresent<NKA>)[]>,
    T extends { [N in keyof D]: (v: { [V in D[N][number]]: InferItemAttributeValue<NKA, V> }) => string[] },
  >({ get: indexKeys }: { get: T, deps?: D }) {
    type Data =
      & { [V in Required<NKA>]: InferItemAttributeValue<NKA, V> }
      & { [V in AlwaysPresent<NKA>]?: InferItemAttributeValue<NKA, V> };
    const indexKeyDefinitions = Object.keys(indexKeys).reduce((acc, indexKey: keyof D) => {
      const get = indexKeys[indexKey];
      acc[indexKey] = { hidden: true, default: (v) => get(v).join('#') };
      return acc;
    }, {} as { [N in keyof D]: { hidden: true, default: (v: Pick<Data, D[N][number]> & Record<string, any>) => string } });
    return new AttributesBase(this.nonKeyAttributes, this.keys, indexKeyDefinitions);
  }
}

class AttributesWithPartitionKey<
  NKA extends NonKeyAttributes, KA extends KeyAttributes
> extends AttributesWithoutIndexKeys<NKA, KA> {
  addSortKey<N extends string, D extends (Required<NKA> | AlwaysPresent<NKA>)[] = []>(
    name: N,
    { get }: {
      get: (v: { [V in D[number]]: InferItemAttributeValue<NKA, V> }) => string[];
      deps?: D;
    },
  ) {
    type Data =
      & { [V in Required<NKA>]: InferItemAttributeValue<NKA, V> }
      & { [V in AlwaysPresent<NKA>]?: InferItemAttributeValue<NKA, V> };
    const sortKey = {
      sortKey: true,
      hidden: true,
      default: (v: Pick<Data, D[number]> & Record<string, any>) => get(v).join('#'),
    } as const;
    const keyAttributes = Object.assign(this.keys, { [name]: sortKey } as { [K in N]: typeof sortKey });
    return new AttributesWithoutIndexKeys(this.nonKeyAttributes, keyAttributes, {});
  }
}

export class Attributes<NKA extends NonKeyAttributes> {
  constructor(public nonKeyAttributes: NKA) { }

  addPartitionKey<N extends string, D extends (Required<NKA> | AlwaysPresent<NKA>)[] = []>(
    name: N,
    { get }: {
      get: (v: { [V in D[number]]: InferItemAttributeValue<NKA, V> }) => string[];
      deps?: D;
    },
  ) {
    type Data =
      & { [V in Required<NKA>]: InferItemAttributeValue<NKA, V> }
      & { [V in AlwaysPresent<NKA>]?: InferItemAttributeValue<NKA, V> };
    const key = {
      partitionKey: true,
      hidden: true,
      default: (v: Pick<Data, D[number]> & Record<string, any>) => get(v).join('#'),
    } as const;
    const keyAttributes = { [name]: key } as {
      [K in N]: typeof key
    };
    return new AttributesWithPartitionKey(this.nonKeyAttributes, keyAttributes, {});
  }
}

export class GSI<PK extends string, SK extends string> {
  constructor(public name: string, public keys: { partitionKey?: PK, sortKey?: SK }) { }

  toString() {
    return this.name;
  }

  get sortKey() {
    return this.keys.sortKey;
  }

  get partitionKey() {
    return this.keys.partitionKey;
  }
}

export class Entity<
  NKA extends NonKeyAttributes,
  KA extends KeyAttributes,
  IKA extends IndexKeyAttributes,
  _Name extends string = string,
  _EntityItemOverlay extends Overlay = string extends _Name ? Overlay : undefined,
  _EntityCompositeKeyOverlay extends Overlay = string extends _Name ? Overlay : _EntityItemOverlay,
  _EntityTable extends TableDef | undefined = string extends _Name ? TableDef | undefined : undefined,
  _AutoExecute extends boolean = string extends _Name ? boolean : true,
  _AutoParse extends boolean = string extends _Name ? boolean : true,
  _Timestamps extends boolean = string extends _Name ? boolean : true,
  _CreatedAlias extends string = string extends _Name ? string : 'created',
  _ModifiedAlias extends string = string extends _Name ? string : 'modified',
  _TypeAlias extends string = string extends _Name ? string : 'entity',
  _ReadonlyAttributeDefinitions extends NKA & KA & IKA = NKA & KA & IKA,
  _WritableAttributeDefinitions extends AttributeDefinitions = Writable<_ReadonlyAttributeDefinitions>,
  _Attributes extends ParsedAttributes = string extends _Name ? ParsedAttributes : If<
    A.Equals<_EntityItemOverlay, undefined>,
    ParseAttributes<_WritableAttributeDefinitions, _Timestamps, _CreatedAlias, _ModifiedAlias, _TypeAlias>,
    ParsedAttributes<keyof _EntityItemOverlay>
  >,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-constraint
  _$Item extends any = string extends _Name ? any : If<
    A.Equals<_EntityItemOverlay, undefined>,
    InferItem<_WritableAttributeDefinitions, _Attributes>,
    _EntityItemOverlay
  >,
  _Item extends O.Object = string extends _Name ? O.Object : A.Cast<_$Item, O.Object>,
  _CompositePrimaryKey extends O.Object = string extends _Name
  ? O.Object
  : If<A.Equals<_EntityItemOverlay, undefined>, InferCompositePrimaryKey<_Item, _Attributes>, O.Object>,
> extends _Entity<
  _Name,
  _EntityItemOverlay,
  _EntityCompositeKeyOverlay,
  _EntityTable,
  _AutoExecute,
  _AutoParse,
  _Timestamps,
  _CreatedAlias,
  _ModifiedAlias,
  _TypeAlias,
  _ReadonlyAttributeDefinitions,
  _WritableAttributeDefinitions,
  _Attributes,
  _$Item,
  _Item,
  _CompositePrimaryKey
> {
  $attributes: AttributesBase<NKA, KA, IKA>;

  declare $primaryKey: Record<keyof KA, string>;
  declare $primaryKeyDependees: U.IntersectOf<Parameters<KA[keyof KA]["default"]>[0]>;

  declare $dto:
    & { [V in Required<NKA>]: InferItemAttributeValue<NKA, V> }
    & { [V in MaybeAbsent<NKA>]?: InferItemAttributeValue<NKA, V> }
    & { [V in AlwaysPresent<NKA>]?: InferItemAttributeValue<NKA, V> };

  declare $data:
    & { [V in Required<NKA>]: InferItemAttributeValue<NKA, V> }
    & { [V in MaybeAbsent<NKA>]?: InferItemAttributeValue<NKA, V> }
    & { [V in AlwaysPresent<NKA>]: InferItemAttributeValue<NKA, V> };

  constructor({ attributes, ...rest }: Omit<
    EntityConstructor<
      _EntityTable, _Name, _AutoExecute, _AutoParse, _Timestamps, _CreatedAlias, _ModifiedAlias, _TypeAlias, {}
    >,
    'attributes'
  > & { attributes: AttributesBase<NKA, KA, IKA> }) {
    super({ attributes: attributes.definitions as _ReadonlyAttributeDefinitions, ...rest });
    this.$attributes = attributes;
  }

  key<K extends keyof KA>(keyAttribute: K, v: Parameters<KA[K]["default"]>[0]): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return
    return this.$attributes.keys[keyAttribute].default(v);
  }

  indexKey<IK extends keyof IKA>(indexKeyAttribute: IK, v: Parameters<IKA[IK]["default"]>[0]): typeof v {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return
    return this.$attributes.indexKeys[indexKeyAttribute].default(v);
  }

  primaryKey(item: typeof this.$primaryKeyDependees) {
    return Object.keys(this.$attributes.keys).reduce(
      (primaryKey, attribute: keyof KA) => Object.assign(primaryKey, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        [attribute]: this.$attributes.keys[attribute].default(item) as string,
      }),
      {} as typeof this.$primaryKey,
    );
  }

  get<
    _MethodItemOverlay extends Overlay = undefined,
    _ShownItemAttributes extends A.Key = If<A.Equals<_MethodItemOverlay, undefined>, _Attributes['shown'], keyof _MethodItemOverlay>,
    _ResponseAttributes extends _ShownItemAttributes = _ShownItemAttributes,
    _Execute extends boolean | undefined = undefined,
    _Parse extends boolean | undefined = undefined
  >(
    item: typeof this.$primaryKeyDependees,
    options?: $GetOptions<_ResponseAttributes, _Execute, _Parse>,
    params?: Partial<DocumentClient.GetItemInput>,
  ): Promise<If<
    B.Not<ShouldExecute<_Execute, _AutoExecute>>,
    DocumentClient.GetItemInput,
    If<
      B.Not<ShouldParse<_Parse, _AutoParse>>,
      DocumentClient.GetItemOutput,
      A.Compute<O.Update<DocumentClient.GetItemOutput, 'Item', FirstDefined<[_MethodItemOverlay, A.Compute<O.Pick<_Item, _ResponseAttributes>>]>>>
    >
  >> {
    const primaryKey = this.primaryKey(item);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return super.get(primaryKey, options, params);
  }

  getBatch(item: typeof this.$primaryKeyDependees) {
    const primaryKey = this.primaryKey(item);
    return super.getBatch(primaryKey);
  }

  async put<
    _MethodItemOverlay extends Overlay = undefined,
    _ShownItemAttributes extends A.Key = If<
      A.Equals<_MethodItemOverlay, undefined>,
      _Attributes['shown'],
      keyof _MethodItemOverlay
    >,
    _ResponseAttributes extends _ShownItemAttributes = _ShownItemAttributes,
    _ReturnValues extends 'NONE' | 'ALL_OLD' = 'NONE',
    _Execute extends boolean | undefined = undefined,
    _Parse extends boolean | undefined = undefined,
    _StrictSchemaCheck extends boolean | undefined = true,
    ReturnStored extends boolean | undefined = undefined,
  >(
    item: typeof this.$dto,
    options:
      & $PutOptions<_ResponseAttributes, _ReturnValues, _Execute, _Parse, _StrictSchemaCheck>
      & { returnStored?: ReturnStored }
      = {},
    params: Partial<DocumentClient.PutItemInput> = {}
  ): Promise<
    If<
      B.Not<ShouldExecute<_Execute, _AutoExecute>>,
      DocumentClient.PutItemInput,
      If<
        B.Not<ShouldParse<_Parse, _AutoParse>>,
        DocumentClient.PutItemOutput,
        // If MethodItemOverlay is defined, ReturnValues is not inferred from args anymore
        O.Omit<DocumentClient.PutItemOutput, 'Attributes'>
        & If<
          B.And<A.Equals<_ReturnValues, 'NONE'>, A.Equals<_MethodItemOverlay, undefined>>,
          {},
          {
            OldItem: FirstDefined<
              [_MethodItemOverlay, _EntityItemOverlay, A.Compute<O.Pick<_Item, _ResponseAttributes>>]
            >
          }
        >
        & If<
          A.Equals<ReturnStored, true>,
          {
            StoredItem: FirstDefined<
              [_MethodItemOverlay, _EntityItemOverlay, A.Compute<O.Pick<_Item, _ResponseAttributes>>]
            >
          },
          {}
        >
      >
    >
  > {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-return */
    const { returnStored, ...libOptions } = options;
    if (libOptions.execute === false) return await super.put(item, libOptions, params);

    const putParams = returnStored && await super.put(item, { ...libOptions, execute: false }, params);
    const itemToStore = putParams && this.parse(putParams.Item);
    const { Attributes, ...result } = await super.put(itemToStore || item, libOptions, params);
    if (Attributes) result.OldItem = Attributes;
    if (itemToStore) result.StoredItem = itemToStore;
    return result;
    /* eslint-enable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-return */
  }

  update<
    _MethodItemOverlay extends Overlay = undefined,
    _ShownItemAttributes extends A.Key = If<A.Equals<_MethodItemOverlay, undefined>, _Attributes['shown'], keyof _MethodItemOverlay>,
    _ResponseAttributes extends _ShownItemAttributes = _ShownItemAttributes,
    _ReturnValues extends UpdateOptionsReturnValues = 'NONE',
    _Execute extends boolean | undefined = undefined,
    _Parse extends boolean | undefined = undefined,
    _StrictSchemaCheck extends boolean | undefined = true,
  >(
    item: A.Compute<typeof this.$primaryKeyDependees & {
      [inputAttr in _Attributes['always']['input']]: _Item[A.Cast<inputAttr, keyof _Item>] | {
        $delete?: string[];
        $add?: any;
        $prepend?: any[];
        $append?: any[];
      };
    } & {
        [optAttr in _Attributes['required']['all'] | _Attributes['always']['default']]?: _Item[A.Cast<optAttr, keyof _Item>] | {
          $delete?: string[];
          $add?: any;
          $prepend?: any[];
          $append?: any[];
        };
      } & {
        [attr in _Attributes['optional']]?: null | _Item[A.Cast<attr, keyof _Item>] | {
          $delete?: string[];
          $add?: any;
          $append?: any[];
          $prepend?: any[];
        };
      } & {
        $remove?: _Attributes['optional'] | _Attributes['optional'][];
      }>,
    options?: $UpdateOptions<_ResponseAttributes, _ReturnValues, _Execute, _Parse, _StrictSchemaCheck>,
    params?: UpdateCustomParams
  ): Promise<A.Compute<If<
    B.Not<ShouldExecute<_Execute, _AutoExecute>>,
    DocumentClient.UpdateItemInput,
    If<
      B.Not<ShouldParse<_Parse, _AutoParse>>,
      DocumentClient.UpdateItemOutput,
      If<
        B.And<A.Equals<_ReturnValues, 'NONE'>, A.Equals<_MethodItemOverlay, undefined>>,
        O.Omit<DocumentClient.UpdateItemOutput, 'Attributes'>,
        O.Update<
          DocumentClient.UpdateItemOutput,
          'Attributes',
          FirstDefined<[_MethodItemOverlay, _EntityItemOverlay, O.Pick<_Item, _ResponseAttributes>]>
        >
      >
    >
  >>> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return super.update(item, options, params);
  }

  putTransaction<
    _MethodItemOverlay extends Overlay = undefined,
    _ItemAttributes extends A.Key = If<A.Equals<_MethodItemOverlay, undefined>, _Attributes['all'], keyof _MethodItemOverlay>,
    _ResponseAttributes extends _ItemAttributes = _ItemAttributes,
    _StrictSchemaCheck extends boolean | undefined = true,
    ThisEntity = typeof this,
  >(
    item: PutItem<_MethodItemOverlay, _EntityItemOverlay, _CompositePrimaryKey, _Item, _Attributes, _StrictSchemaCheck>,
    options?: TransactionOptions<_ResponseAttributes, _StrictSchemaCheck> | undefined,
    params?: Partial<DocumentClient.PutItemInput> | undefined
  ): { Put: DocumentClient.Put; _entity?: ThisEntity } {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return Object.assign(super.putTransaction(item, options as any, params), { _entity: this });
  }

  getHashId(item: typeof this.$primaryKeyDependees) {
    const tuple = [] as string[];
    Object.values(this.$attributes.keys).forEach(({ partitionKey, sortKey, default: get }) => {
      /* eslint-disable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unsafe-call */
      if (partitionKey) tuple[0] = get(item) as string;
      else if (sortKey) tuple[1] = get(item) as string;
      /* eslint-enable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unsafe-call */
    });
    return hash(tuple);
  }

  parseHashId(hashId: string) {
    const tuple = dehash(hashId) as [string, string];
    const key = {} as { [K in keyof KA]: string };
    Object.keys(this.$attributes.keys).forEach((name: keyof KA) => {
      /* eslint-disable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unsafe-assignment */
      const { partitionKey, sortKey } = this.$attributes.keys[name];
      if (partitionKey) key[name] = tuple[0];
      else if (sortKey) key[name] = tuple[1];
      /* eslint-enable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unsafe-assignment */
    });
    return key;
  }

  // queryIndex(index: <sum type>, {...})


  // betterTyped() {
  //   type ThisType = typeof this;
  //   return this as unknown as Omit<ThisType, 'delete'>&{
  //     delete: (keys: { [K in keyof KA]: string }) => ReturnType<ThisType['delete']>
  //   };
  // }

  // override delete(keys: { [K in keyof KA]: string }&{ [V in keyof NKA]: InferItemAttributeValue<NKA, V> }) {
  //   return super.delete(keys);
  // };
}

// Attributes.addIndexKeys({ [GSI1]: () => [,,] })
// gsi = new GSI<Entity1|Entity2>()
// gsi.query(...)
