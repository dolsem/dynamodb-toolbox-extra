import { Entity } from 'dynamodb-toolbox-types';
import type {
  AttributeDefinitions,
  Overlay,
  Writable,
  ParseAttributes,
  ParsedAttributes,
  InferItem,
  InferCompositePrimaryKey,
} from 'dynamodb-toolbox-types/dist/classes/Entity';
import type { TableDef } from 'dynamodb-toolbox-types/dist/classes/Table';
import type { If } from 'dynamodb-toolbox-types/dist/lib/utils';
import type { A, O } from 'ts-toolbelt';

// This is needed because TS does not allow to break Liskov substitution
//  (i.e. override method arg types in subclass)
export class EntityKlass<
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
  _ReadonlyAttributeDefinitions extends Readonly<AttributeDefinitions> = Readonly<AttributeDefinitions>,
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
> extends Entity<
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
  override put(...args: any[]): any {
    return null;
  }

  override get(...args: any[]): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
    return (super.get as any).apply(this, args);
  }

  override update(...args: any[]): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
    return (super.update as any).apply(this, args);
  }

  override getBatch<_MethodCompositeKeyOverlay extends Overlay = undefined>(item: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return super.getBatch<_MethodCompositeKeyOverlay>(item);
  }

  override putTransaction(...args: any[]): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
    return (super.putTransaction as any).apply(this, args);
  }
}
