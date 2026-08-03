import type { NextFunction, Request, Response } from "express";
import express from "express";
import multer from "multer";
import { ZodError } from "zod";

import { isAppError, type EvolutionModelLabService } from "@eml/core";
import {
  candidateFeedbackInputSchema,
  candidateSourceSchema,
  confirmContactSheetInputSchema,
  contactSheetLayoutSchema,
  createCreatureInputSchema,
  selectCandidateInputSchema,
  uuidParameterSchema,
} from "@eml/shared";

function asyncRoute(
  handler: (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

export function createApp(service: EvolutionModelLabService): express.Express {
  const app = express();
  const maximumUploadBytes = Number(
    process.env.MAXIMUM_UPLOAD_BYTES ?? 10_485_760,
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maximumUploadBytes, files: 10, fields: 12 },
  });

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, service: "Evolution Model Lab", milestone: 2 });
  });

  app.get("/api/dashboard", (_request, response) => {
    response.json({ data: service.getDashboard() });
  });

  app.get("/api/creatures", (_request, response) => {
    response.json({ data: service.listCreatures() });
  });

  app.post(
    "/api/creatures",
    asyncRoute(async (request, response) => {
      const input = createCreatureInputSchema.parse(request.body);
      const creature = await service.createCreature(input);
      response.status(201).json({ data: creature });
    }),
  );

  app.get("/api/creatures/:creatureId", (request, response) => {
    const creatureId = uuidParameterSchema.parse(request.params.creatureId);
    response.json({ data: service.getCreature(creatureId) });
  });

  app.post(
    "/api/creatures/:creatureId/rounds/concept",
    asyncRoute(async (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      const round = await service.createConceptRound(creatureId);
      response.status(201).json({ data: round });
    }),
  );

  app.post(
    "/api/creatures/:creatureId/rounds/refinement",
    asyncRoute(async (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      const round = await service.createRefinementRound(creatureId);
      response.status(201).json({ data: round });
    }),
  );

  app.get("/api/creatures/:creatureId/prompts", (request, response) => {
    const creatureId = uuidParameterSchema.parse(request.params.creatureId);
    response.json({ data: service.getPromptHistory(creatureId) });
  });

  app.get("/api/rounds/:roundId", (request, response) => {
    const roundId = uuidParameterSchema.parse(request.params.roundId);
    response.json({ data: service.getRound(roundId) });
  });

  app.post(
    "/api/creatures/:creatureId/rounds/:roundId/candidates",
    upload.array("images", 10),
    asyncRoute(async (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      const roundId = uuidParameterSchema.parse(request.params.roundId);
      const source = candidateSourceSchema.parse(
        request.body.source ?? "MANUAL",
      );
      const uploadedFiles =
        (request.files as Express.Multer.File[] | undefined) ?? [];
      const imported = await service.importCandidates({
        creatureId,
        roundId,
        source,
        files: uploadedFiles.map((file) => ({
          buffer: file.buffer,
          originalFilename: file.originalname,
        })),
      });
      response.status(201).json({ data: imported });
    }),
  );

  app.post("/api/rounds/:roundId/select", (request, response) => {
    const roundId = uuidParameterSchema.parse(request.params.roundId);
    const parsed = selectCandidateInputSchema.parse({
      roundId,
      candidateId: request.body.candidateId,
    });
    response.json({
      data: service.selectCandidate(parsed.roundId, parsed.candidateId),
    });
  });

  app.patch("/api/candidates/:candidateId/feedback", (request, response) => {
    const candidateId = uuidParameterSchema.parse(request.params.candidateId);
    const feedback = candidateFeedbackInputSchema.parse(request.body);
    response.json({
      data: service.saveCandidateFeedback(candidateId, feedback),
    });
  });

  app.post(
    "/api/creatures/:creatureId/rounds/:roundId/contact-sheets/preview",
    upload.single("image"),
    asyncRoute(async (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      const roundId = uuidParameterSchema.parse(request.params.roundId);
      const layout = contactSheetLayoutSchema.parse(request.body);
      if (!request.file) {
        response.status(400).json({
          error: {
            code: "CONTACT_SHEET_REQUIRED",
            message: "Choose one contact-sheet PNG to preview.",
          },
        });
        return;
      }
      const preview = await service.previewContactSheet({
        creatureId,
        roundId,
        layout,
        file: {
          buffer: request.file.buffer,
          originalFilename: request.file.originalname,
        },
      });
      response.status(201).json({ data: preview });
    }),
  );

  app.post(
    "/api/contact-sheets/:contactSheetId/confirm",
    asyncRoute(async (request, response) => {
      const contactSheetId = uuidParameterSchema.parse(
        request.params.contactSheetId,
      );
      const parsed = confirmContactSheetInputSchema.parse(request.body);
      response.status(201).json({
        data: await service.confirmContactSheet(
          contactSheetId,
          parsed.selectedCropIndexes,
        ),
      });
    }),
  );

  app.get(
    "/api/contact-sheets/:contactSheetId/image",
    (request, response, next) => {
      try {
        const contactSheetId = uuidParameterSchema.parse(
          request.params.contactSheetId,
        );
        const media = service.getContactSheetMedia(contactSheetId);
        response.type(media.mimeType);
        response.setHeader("Cache-Control", "private, max-age=3600");
        response.sendFile(media.path, (error) => {
          if (error) next(error);
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/candidates/:candidateId/:kind", (request, response, next) => {
    try {
      const candidateId = uuidParameterSchema.parse(request.params.candidateId);
      const kind = request.params.kind;
      if (kind !== "image" && kind !== "thumbnail") {
        response.status(404).json({
          error: { code: "MEDIA_NOT_FOUND", message: "Media not found." },
        });
        return;
      }
      const media = service.getCandidateMedia(candidateId, kind);
      response.type(media.mimeType);
      response.setHeader("Cache-Control", "private, max-age=3600");
      response.sendFile(media.path, (error) => {
        if (error) next(error);
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((_request, response) => {
    response
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Route not found." } });
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      void next;
      if (error instanceof multer.MulterError) {
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? `Each PNG must be no larger than ${maximumUploadBytes} bytes.`
            : error.message;
        response.status(400).json({ error: { code: error.code, message } });
        return;
      }
      if (error instanceof ZodError) {
        response.status(400).json({
          error: {
            code: "INVALID_INPUT",
            message: "Please correct the highlighted input.",
            details: error.flatten(),
          },
        });
        return;
      }
      if (isAppError(error)) {
        response.status(error.status).json({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
        return;
      }
      console.error(error);
      response.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "The operation failed and was not saved.",
        },
      });
    },
  );

  return app;
}
