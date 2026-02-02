import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../utils/prisma.js';
import {
  TrainingMode,
  trainingModeConfigSchema,
  trainingModeSchema,
  type TrainingModeConfig,
} from '../common/index.js';

type TrainingModeConfigRecord = {
  trainingMode: string;
  label: string;
  description: string | null;
  imageUrl: string;
  displayOrder: number;
  showDepartureAirport: boolean;
  showArrivalAirport: boolean;
  showAircraftType: boolean;
  showTailNumber: boolean;
  initRadioType?: string | null; // Optional to support existing records without this field
  isFree?: boolean; // Optional to support existing records without this field
};

const normalizeConfig = (
  record: TrainingModeConfigRecord,
  trainingMode: TrainingMode
): TrainingModeConfig => {

  const parsed = trainingModeConfigSchema.safeParse({
    trainingMode,
    label: record.label,
    description: record.description,
    imageUrl: record.imageUrl,
    displayOrder: record.displayOrder,
    showDepartureAirport: record.showDepartureAirport,
    showArrivalAirport: record.showArrivalAirport,
    showAircraftType: record.showAircraftType,
    showTailNumber: record.showTailNumber,
    initRadioType: record.initRadioType ?? null,
    isFree: record.isFree ?? false,
  });

  if (!parsed.success) {
    throw new Error(`Invalid training mode config for: ${trainingMode}. ${parsed.error.message}`);
  }

  return parsed.data;
};

export class TrainingModeController {
  static async getTrainingModeConfig(
    request: FastifyRequest<{ Params: { trainingMode: TrainingMode } }>,
    reply: FastifyReply
  ) {
    const { trainingMode } = request.params;

    try {
      const record = await prisma.trainingModeConfig.findUnique({
        where: { trainingMode },
      });

      if (!record) {
        return reply.code(404).send({
          error: 'Training mode config not found',
          trainingMode,
        });
      }

      const config = normalizeConfig(record as TrainingModeConfigRecord, trainingMode);

      return reply.send(config);
    } catch (error) {
      request.log.error(
        {
          error: error instanceof Error ? error.message : error,
          trainingMode,
        },
        'Failed to fetch training mode config'
      );

      if (error instanceof Error && error.message.includes('not found')) {
        return reply.code(404).send({
          error: error.message,
          trainingMode,
        });
      }

      return reply.code(500).send({
        error: 'Failed to fetch training mode config',
        trainingMode,
      });
    }
  }

  static async getTrainingModes(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      const records = await prisma.trainingModeConfig.findMany({
        orderBy: { displayOrder: 'asc' },
      });

      // Only return training modes that exist in the database
      const configs = records
        .map((record) => {
          const trainingModeValue = trainingModeSchema.safeParse(record.trainingMode);
          if (!trainingModeValue.success) {
            return null;
          }
          try {
            return normalizeConfig(record as TrainingModeConfigRecord, trainingModeValue.data);
          } catch (error) {
            request.log.warn(
              {
                error: error instanceof Error ? error.message : error,
                trainingMode: record.trainingMode,
              },
              'Failed to normalize training mode config, skipping'
            );
            return null;
          }
        })
        .filter((config): config is TrainingModeConfig => config !== null)
        .sort((a, b) => a.displayOrder - b.displayOrder);

      return reply.send(configs);
    } catch (error) {
      request.log.error(
        { error: error instanceof Error ? error.message : error },
        'Failed to fetch training modes'
      );
      // Return empty array on error instead of fallback defaults
      return reply.send([]);
    }
  }
}

