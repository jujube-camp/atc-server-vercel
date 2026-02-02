import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';

type SubmitFeedbackRequest = FastifyRequest<{
  Body: {
    message: string;
    category?: string;
    contact?: string;
    platform?: string;
    appVersion?: string;
    metadata?: Record<string, unknown>;
  };
}>;

export class FeedbackController {
  static async submitFeedback(request: SubmitFeedbackRequest, reply: FastifyReply) {
    const userId = (request.user as any)?.userId ?? null;
    const { message, category, contact, platform, appVersion, metadata } = request.body;

    await prisma.feedback.create({
      data: {
        message,
        category,
        contact,
        platform,
        appVersion,
        metadata: metadata as Prisma.InputJsonValue | undefined,
        userId: userId ?? undefined,
      },
    });

    return reply.code(201).send({ success: true });
  }
}


