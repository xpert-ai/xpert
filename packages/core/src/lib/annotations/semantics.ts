import { PrimitiveType, PropertyName } from '../types'

/**
 * Semantic annotations are used to inform the client as to which of the elements contain a phone number, a part of a name or address, or something relating to a calendar event.
 * They must not be bound, for example, to a dedicated consumption channel. They need to be available for consumption through OData, (S)QL, and so on.
 *
 * Semantic annotations complement the concept of semantic data types,
 * while semantic data types always introduce specific behavior
 * in the provider/core infrastructure (through dedicated operations or conversion functions).
 *
 * Refer [Semantics Annotations](https://help.sap.com/viewer/cc0c305d2fab47bd808adcad3ca7ee9d/7.5.9/en-US/fbcd3a59a94148f6adad80b9c97304ff.html)
 */
export interface PropertySemantic {
  name: Semantics
  value?: PropertyName | PrimitiveType
}

/**
 * https://docs.microsoft.com/en-us/analysis-services/multidimensional-models/attribute-properties-configure-attribute-types?view=asallproducts-allversions
 */
export enum Semantics {
  Account = 'Account',
  // Address
  'Address.Street' = 'Address.Street',
  'Address.PostBox' = 'Address.PostBox',
  'Address.ZipCode' = 'Address.ZipCode',
  'Address.City' = 'Address.City',
  'Address.Country' = 'Address.Country',
  'Address.SubRegion' = 'Address.SubRegion',
  'Address.Region' = 'Address.Region',
  'Amount.CurrencyCode' = 'Amount.CurrencyCode',
  'BusinessDate.At' = 'BusinessDate.At',
  'BusinessDate.From' = 'BusinessDate.From',
  'BusinessDate.To' = 'BusinessDate.To',
  /**
   * Semantics.calendar follow the iCalendar standard ([RFC5545](https://tools.ietf.org/html/rfc5545))
   */
  Calendar = 'Calendar',
  'Calendar.Year' = 'Calendar.Year',
  'Calendar.Quarter' = 'Calendar.Quarter',
  'Calendar.Month' = 'Calendar.Month',
  'Calendar.Week' = 'Calendar.Week',
  'Calendar.Day' = 'Calendar.Day',

  'CurrencyCode' = 'CurrencyCode',
  // This annotation identifies a field that identifies languages.
  Language = 'Language',

  // GeoLocation
  Geography = 'Geography',
  'GeoLocation.Latitude' = 'GeoLocation.Latitude',
  'GeoLocation.Longitude' = 'GeoLocation.Longitude',
  'Quantity.UnitOfMeasure' = 'Quantity.UnitOfMeasure',

  // This annotation identifies a human-readable text that is not necessarily language-dependent.
  Text = 'Text',
  UnitOfMeasure = 'UnitOfMeasure',

  'Sys.UserName' = 'Sys.UserName',
  'Sys.UserRole' = 'Sys.UserRole',
  'Sys.UserEmail' = 'Sys.UserEmail'
  // ... more
}

export const CalendarSemantics = Object.values(Semantics).filter((value) => value.startsWith('Calendar'))