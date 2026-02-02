import { prisma } from '../utils/prisma.js';

type Airport = {
  id: string;
  ident: string;
  type: string;
  name: string;
  latitudeDeg: number | null;
  longitudeDeg: number | null;
  elevationFt: string | null;
  continent: string;
  isoCountry: string;
  isoRegion: string;
  municipality: string | null;
  scheduledService: string | null;
  icaoCode: string | null;
  iataCode: string | null;
  gpsCode: string | null;
  localCode: string | null;
  jsonData: string | null;
};

function mapAirportToResponse(airport: Airport) {
  return {
    id: airport.id,
    ident: airport.ident,
    type: airport.type,
    name: airport.name,
    latitude_deg: airport.latitudeDeg,
    longitude_deg: airport.longitudeDeg,
    elevation_ft: airport.elevationFt,
    continent: airport.continent,
    iso_country: airport.isoCountry,
    iso_region: airport.isoRegion,
    municipality: airport.municipality,
    scheduled_service: airport.scheduledService,
    icao_code: airport.icaoCode,
    iata_code: airport.iataCode,
    gps_code: airport.gpsCode,
    local_code: airport.localCode,
    json_data: airport.jsonData,
  };
}

const FIELD_TO_DB_COLUMN: Record<string, keyof Airport> = {
  id: 'id',
  ident: 'ident',
  type: 'type',
  name: 'name',
  latitude_deg: 'latitudeDeg',
  longitude_deg: 'longitudeDeg',
  elevation_ft: 'elevationFt',
  continent: 'continent',
  iso_country: 'isoCountry',
  iso_region: 'isoRegion',
  municipality: 'municipality',
  scheduled_service: 'scheduledService',
  icao_code: 'icaoCode',
  iata_code: 'iataCode',
  gps_code: 'gpsCode',
  local_code: 'localCode',
  json_data: 'jsonData',
};

const FIELD_SLUG_TO_CANONICAL = Object.keys(FIELD_TO_DB_COLUMN).reduce(
  (acc, key) => {
    const slug = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    acc[slug] = key;
    return acc;
  },
  {} as Record<string, keyof typeof FIELD_TO_DB_COLUMN>
);

const normalizeFieldName = (field: string): keyof typeof FIELD_TO_DB_COLUMN | undefined => {
  const slug = field.toLowerCase().replace(/[^a-z0-9]/g, '');
  return FIELD_SLUG_TO_CANONICAL[slug];
};

function filterFields(data: Record<string, any>, fields: string[] | undefined) {
  if (!fields || fields.length === 0) {
    return data;
  }

  const filtered: Record<string, any> = {};
  fields.forEach(field => {
    if (data[field] !== undefined) {
      filtered[field] = data[field];
    }
  });
  return filtered;
}

export class AirportService {
  /**
   * Get airport by ICAO code
   */
  static async getAirportByIcaoCode(icaoCode: string) {
    const airport = await (prisma as any).airport.findUnique({
      where: { icaoCode },
    }) as Airport | null;

    if (!airport) {
      const error: any = new Error('Airport not found');
      error.statusCode = 404;
      throw error;
    }

    return mapAirportToResponse(airport);
  }

  /**
   * Get all airports with optional field selection
   */
  static async getAllAirports(fields?: string[]) {
    const canonicalFields =
      fields
        ?.map(field => normalizeFieldName(field))
        .filter((field): field is keyof typeof FIELD_TO_DB_COLUMN => Boolean(field)) ?? [];

    const validFields = canonicalFields;

    const select =
      validFields.length > 0
        ? validFields.reduce((acc, field) => {
            const column = FIELD_TO_DB_COLUMN[field];
            acc[column] = true;
            return acc;
          }, {} as Record<keyof Airport, true>)
        : undefined;

    const airports = await (prisma as any).airport.findMany({
      where: { hasFreqs: 1 },
      orderBy: { name: 'asc' },
      ...(select ? { select } : {}),
    }) as Partial<Airport>[];

    const mapped = airports.map(airport =>
      mapAirportToResponse(airport as Airport)
    );

    if (validFields.length > 0) {
      return mapped.map((airport: Record<string, any>) => filterFields(airport, validFields));
    }

    return mapped;
  }
}

