import type { SchemaTable } from './types.js'

export const SCHEMA_TABLES: SchemaTable[] = [
  {
    name: 'tours',
    columns: [
      { name: 'id', type: 'uuid', pk: true },
      { name: 'name', type: 'varchar(255)' },
      { name: 'destination', type: 'varchar(120)' },
      { name: 'category', type: 'enum' },
      { name: 'price', type: 'decimal(10,2)' },
      { name: 'duration_hours', type: 'numeric' },
      { name: 'max_group_size', type: 'int' },
      { name: 'rating', type: 'numeric(2,1)' },
    ],
  },
  {
    name: 'bookings',
    columns: [
      { name: 'id', type: 'uuid', pk: true },
      { name: 'tour_id', type: 'uuid', fk: 'tours.id' },
      { name: 'date', type: 'date' },
      { name: 'guests', type: 'int' },
      { name: 'contact_email', type: 'varchar(255)' },
      { name: 'contact_phone', type: 'varchar(40)' },
      { name: 'status', type: 'enum' },
      { name: 'total_price', type: 'decimal(10,2)' },
      { name: 'created_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'availability',
    columns: [
      { name: 'id', type: 'uuid', pk: true },
      { name: 'tour_id', type: 'uuid', fk: 'tours.id' },
      { name: 'date', type: 'date' },
      { name: 'spots_left', type: 'int' },
      { name: 'price_override', type: 'decimal(10,2)', nullable: true },
    ],
  },
  {
    name: 'reviews',
    columns: [
      { name: 'id', type: 'uuid', pk: true },
      { name: 'tour_id', type: 'uuid', fk: 'tours.id' },
      { name: 'author', type: 'varchar(120)' },
      { name: 'rating', type: 'int' },
      { name: 'comment', type: 'text' },
      { name: 'created_at', type: 'date' },
    ],
  },
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'uuid', pk: true },
      { name: 'email', type: 'varchar(255)' },
      { name: 'phone', type: 'varchar(40)', nullable: true },
      { name: 'name', type: 'varchar(120)' },
      { name: 'created_at', type: 'timestamptz' },
    ],
  },
]
