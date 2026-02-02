export type AirportInfoRecord = {
  icao_code?: string | null;
  iata_code?: string | null;
  name?: string | null;
  municipality?: string | null;
  iso_region?: string | null;
  iso_country?: string | null;
  elevation_ft?: number | string | null;
  latitude_deg?: number | null;
  longitude_deg?: number | null;
  json_data?: string | null;
  [key: string]: unknown;
};

export type StructuredAirportInfo = {
  airport: {
    // icao: string;
    name: string;
    // location: {
    //   city: string;
    //   region: string;
    //   country: string;
    // };
  };
  runways: Array<{
    le_ident: string;
    he_ident: string;
    // length_ft: number;
    // width_ft: number;
    // surface: string;
    // closed: string;
    // he_ils?: {
    //   freq: number;
    //   course: number;
    // };
    // le_ils?: {
    //   freq: number;
    //   course: number;
    // };
  }>;
  freqs: Record<string, string | string[]>;
};

const coalesceString = (...values: Array<unknown>): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
};

// Unused function - kept for potential future use
// const coalesceNumber = (...values: Array<unknown>): number | null => {
//   for (const value of values) {
//     if (typeof value === 'number' && Number.isFinite(value)) {
//       return value;
//     }
//     if (typeof value === 'string' && value.trim().length > 0) {
//       const parsed = Number(value);
//       if (Number.isFinite(parsed)) {
//         return parsed;
//       }
//     }
//   }
//   return null;
// };

const ensureRunwayArray = (runways: unknown): Array<Record<string, any>> =>
  Array.isArray(runways) ? runways : [];

export const normalizeAirportInfo = (
  airportInfo: AirportInfoRecord | null | undefined
): StructuredAirportInfo => {
  let parsedJson: Record<string, any> = {};
  if (airportInfo?.json_data) {
    try {
      const maybeParsed = JSON.parse(airportInfo.json_data);
      if (maybeParsed && typeof maybeParsed === 'object') {
        parsedJson = maybeParsed;
      }
    } catch {
      parsedJson = {};
    }
  }

  // const icao = coalesceString(parsedJson?.ident, parsedJson?.icao_code, parsedJson?.gps_code, airportInfo?.icao_code);
  const name = coalesceString(parsedJson?.name, airportInfo?.name);
  // const city = coalesceString(parsedJson?.municipality, airportInfo?.municipality);
  // const region = coalesceString(parsedJson?.iso_region, airportInfo?.iso_region);
  // const country = coalesceString(parsedJson?.iso_country, airportInfo?.iso_country);

  const runways = ensureRunwayArray(parsedJson?.runways)
    .filter((runway: Record<string, any>) => {
      // Only keep runways where closed field is "0"
      const closed = runway?.closed;
      return closed === "0" || closed === 0;
    })
    .map((runway: Record<string, any>) => {
    const runwayObj: {
      le_ident: string,
      he_ident: string,
      // length_ft: number;
      // width_ft: number;
      // surface: string;
      // closed: string;
      // he_ils?: { freq: number; course: number };
      // le_ils?: { freq: number; course: number };
    } = {
      le_ident: coalesceString(runway?.le_ident),
      he_ident: coalesceString(runway?.he_ident),
      // length_ft: coalesceNumber(runway?.length_ft) ?? 0,
      // width_ft: coalesceNumber(runway?.width_ft) ?? 0,
      // surface: coalesceString(runway?.surface),
      // closed: coalesceString(runway?.closed, "0"),
    };

    // if (runway?.he_ils && typeof runway.he_ils === 'object') {
    //   const heFreq = coalesceNumber(runway.he_ils.freq);
    //   const heCourse = coalesceNumber(runway.he_ils.course);
    //   if (heFreq !== null && heCourse !== null) {
    //     runwayObj.he_ils = { freq: heFreq, course: heCourse };
    //   }
    // }

    // if (runway?.le_ils && typeof runway.le_ils === 'object') {
    //   const leFreq = coalesceNumber(runway.le_ils.freq);
    //   const leCourse = coalesceNumber(runway.le_ils.course);
    //   if (leFreq !== null && leCourse !== null) {
    //     runwayObj.le_ils = { freq: leFreq, course: leCourse };
    //   }
    // }

    return runwayObj;
  });

  const freqs: Record<string, string | string[]> = {};
  const freqsArray = Array.isArray(parsedJson?.freqs) ? parsedJson.freqs : [];
  for (const freq of freqsArray) {
    if (freq?.type && freq?.frequency_mhz) {
      const freqType = coalesceString(freq.type);
      const freqValue = coalesceString(freq.frequency_mhz);
      if (freqType && freqValue) {
        const existing = freqs[freqType];
        if (!existing) {
          freqs[freqType] = freqValue;
        } else if (Array.isArray(existing)) {
          existing.push(freqValue);
        } else if (existing !== freqValue) {
          freqs[freqType] = [existing, freqValue];
        }
      }
    }
  }

  return {
    airport: {
      // icao,
      name,
      // location: {
      //   city,
      //   region,
      //   country,
      // },
    },
    runways,
    freqs,
  };
};

/**
 * Determine which ATC facility type the user's selected frequency belongs to
 * Returns all matching frequency types joined by "/" (e.g., "TWR/CTAF")
 * If both TWR and CTAF are matched, returns only "TWR"
 */
export const getUserFrequencyType = (
  structuredInfo: StructuredAirportInfo | null,
  frequencyValue: string | null
): string => {
  if (!structuredInfo || !frequencyValue) {
    return 'UNKNOWN';
  }

  const normalize = (value: string): string => value.trim().toLowerCase();
  const toNumber = (value: string): number | null => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const targetNumber = toNumber(frequencyValue);
  const targetString = normalize(frequencyValue);
  const matchedTypes: string[] = [];

  for (const [freqType, freqValue] of Object.entries(structuredInfo.freqs ?? {})) {
    if (typeof freqValue === 'string') {
      const candidateNumber = toNumber(freqValue);
      const candidateString = normalize(freqValue);

      if (
        (targetNumber !== null && candidateNumber !== null && Math.abs(candidateNumber - targetNumber) < 0.001) ||
        candidateString === targetString
      ) {
        matchedTypes.push(freqType.toUpperCase());
      }
    } else if (Array.isArray(freqValue)) {
      for (const entry of freqValue) {
        if (typeof entry !== 'string') continue;

        const candidateNumber = toNumber(entry);
        const candidateString = normalize(entry);

        if (
          (targetNumber !== null && candidateNumber !== null && Math.abs(candidateNumber - targetNumber) < 0.001) ||
          candidateString === targetString
        ) {
          matchedTypes.push(freqType.toUpperCase());
          break; // Only add this freqType once even if multiple entries match
        }
      }
    }
  }

  // If both TWR and CTAF are matched, prefer TWR only
  if (matchedTypes.includes('TWR') && matchedTypes.includes('CTAF')) {
    matchedTypes.splice(matchedTypes.indexOf('CTAF'), 1);
  }

  return matchedTypes.length > 0 ? matchedTypes.join('/') : 'UNKNOWN';
};

