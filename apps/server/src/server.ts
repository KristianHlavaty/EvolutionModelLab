import type { NextFunction, Request, Response } from "express";
import express from "express";
import multer from "multer";
import { ZodError } from "zod";

import { isAppError, type EvolutionModelLabService } from "@eml/core";
import {
  approveReferenceInputSchema,
  approveAnimationInputSchema,
  animationSettingsInputSchema,
  candidateFeedbackInputSchema,
  candidateRejectionInputSchema,
  candidateSourceSchema,
  confirmContactSheetInputSchema,
  contactSheetLayoutSchema,
  createDescendantInputSchema,
  createCreatureInputSchema,
  designManifestInputSchema,
  destructiveActionInputSchema,
  exportCreatureInputSchema,
  lockDesignInputSchema,
  importReferenceMetadataSchema,
  projectReferenceSettingsInputSchema,
  createReferenceInputSchema,
  createAnimationInputSchema,
  importAnimationFrameMetadataSchema,
  reorderAnimationFramesInputSchema,
  repairPromptInputSchema,
  replaceAnimationFrameMetadataSchema,
  updateAnimationFrameInputSchema,
  selectCandidateInputSchema,
  unlockDesignInputSchema,
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
  const animationUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maximumUploadBytes, files: 120, fields: 12 },
  });

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, service: "Evolution Model Lab", milestone: 7 });
  });

  app.get("/api/dashboard", (_request, response) => {
    response.json({ data: service.getDashboard() });
  });

  app.get("/api/creatures", (_request, response) => {
    response.json({ data: service.listCreatures() });
  });

  app.get("/api/evolution", (_request, response) => {
    response.json({ data: service.getEvolutionTree() });
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

  app.get("/api/creatures/:creatureId/evolution", (request, response) => {
    const creatureId = uuidParameterSchema.parse(request.params.creatureId);
    response.json({ data: service.getEvolutionContext(creatureId) });
  });

  app.post(
    "/api/creatures/:creatureId/descendants",
    asyncRoute(async (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      const input = createDescendantInputSchema.parse(request.body);
      response
        .status(201)
        .json({ data: await service.createDescendant(creatureId, input) });
    }),
  );

  app.get("/api/creatures/:creatureId/references", (request, response) => {
    const creatureId = uuidParameterSchema.parse(request.params.creatureId);
    response.json({ data: service.getReferenceContext(creatureId) });
  });

  app.post(
    "/api/creatures/:creatureId/references",
    asyncRoute(async (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      const input = createReferenceInputSchema.parse(request.body);
      response.status(201).json({
        data: await service.createReference(creatureId, input),
      });
    }),
  );

  app.post(
    "/api/references/:referenceId/import",
    upload.single("image"),
    asyncRoute(async (request, response) => {
      const referenceId = uuidParameterSchema.parse(request.params.referenceId);
      const metadata = importReferenceMetadataSchema.parse(request.body);
      if (!request.file) {
        response.status(400).json({
          error: {
            code: "REFERENCE_IMAGE_REQUIRED",
            message: "Choose one canonical-reference PNG to import.",
          },
        });
        return;
      }
      response.status(201).json({
        data: await service.importReference(
          referenceId,
          {
            buffer: request.file.buffer,
            originalFilename: request.file.originalname,
          },
          metadata.notes,
          metadata.actor,
        ),
      });
    }),
  );

  app.post(
    "/api/references/:referenceId/approve",
    asyncRoute(async (request, response) => {
      const referenceId = uuidParameterSchema.parse(request.params.referenceId);
      const input = approveReferenceInputSchema.parse(request.body);
      response.json({
        data: await service.approveReference(referenceId, input),
      });
    }),
  );

  app.get("/api/reference-settings", (_request, response) => {
    response.json({ data: service.getReferenceSettings() });
  });

  app.patch("/api/reference-settings", (request, response) => {
    const input = projectReferenceSettingsInputSchema.parse(request.body);
    response.json({ data: service.updateReferenceSettings(input) });
  });

  app.get("/api/creatures/:creatureId/animations", (request, response) => {
    const creatureId = uuidParameterSchema.parse(request.params.creatureId);
    response.json({ data: service.listAnimations(creatureId) });
  });

  app.post(
    "/api/creatures/:creatureId/animations",
    asyncRoute(async (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      const input = createAnimationInputSchema.parse(request.body);
      response
        .status(201)
        .json({ data: await service.createAnimation(creatureId, input) });
    }),
  );

  app.get("/api/animations/:animationId", (request, response) => {
    const animationId = uuidParameterSchema.parse(request.params.animationId);
    response.json({ data: service.getAnimation(animationId) });
  });

  app.patch("/api/animations/:animationId/settings", (request, response) => {
    const animationId = uuidParameterSchema.parse(request.params.animationId);
    const input = animationSettingsInputSchema.parse(request.body);
    response.json({
      data: service.updateAnimationSettings(animationId, input),
    });
  });

  app.post(
    "/api/animations/:animationId/frames",
    animationUpload.array("images", 120),
    asyncRoute(async (request, response) => {
      const animationId = uuidParameterSchema.parse(request.params.animationId);
      const metadata = importAnimationFrameMetadataSchema.parse(request.body);
      const files = (request.files as Express.Multer.File[] | undefined) ?? [];
      response.status(201).json({
        data: await service.importAnimationFrames(
          animationId,
          files.map((file) => ({
            buffer: file.buffer,
            originalFilename: file.originalname,
          })),
          metadata.frameRole,
          metadata.source,
          metadata.actor,
        ),
      });
    }),
  );

  app.patch(
    "/api/animations/:animationId/frames/order",
    (request, response) => {
      const animationId = uuidParameterSchema.parse(request.params.animationId);
      const input = reorderAnimationFramesInputSchema.parse(request.body);
      response.json({
        data: service.reorderAnimationFrames(animationId, input),
      });
    },
  );

  app.patch("/api/animation-frames/:frameId", (request, response) => {
    const frameId = uuidParameterSchema.parse(request.params.frameId);
    const input = updateAnimationFrameInputSchema.parse(request.body);
    response.json({ data: service.updateAnimationFrame(frameId, input) });
  });

  app.delete("/api/animation-frames/:frameId", (request, response) => {
    const frameId = uuidParameterSchema.parse(request.params.frameId);
    const input = destructiveActionInputSchema.parse(request.body ?? {});
    response.json({
      data: service.deleteAnimationFrame(
        frameId,
        input.confirmed,
        "LOCAL_USER",
      ),
    });
  });

  app.post(
    "/api/animations/:animationId/prompts/intermediates",
    asyncRoute(async (request, response) => {
      const animationId = uuidParameterSchema.parse(request.params.animationId);
      const metadata = importReferenceMetadataSchema.parse(request.body ?? {});
      response.status(201).json({
        data: await service.createIntermediateAnimationPrompt(
          animationId,
          metadata.actor,
        ),
      });
    }),
  );

  app.post(
    "/api/animation-frames/:frameId/prompts/repair",
    asyncRoute(async (request, response) => {
      const frameId = uuidParameterSchema.parse(request.params.frameId);
      const input = repairPromptInputSchema.parse(request.body);
      response.status(201).json({
        data: await service.createAnimationRepairPrompt(frameId, input),
      });
    }),
  );

  app.post(
    "/api/animation-frames/:frameId/replacement",
    upload.single("image"),
    asyncRoute(async (request, response) => {
      const frameId = uuidParameterSchema.parse(request.params.frameId);
      const metadata = replaceAnimationFrameMetadataSchema.parse(request.body);
      if (!request.file) {
        response.status(400).json({
          error: {
            code: "REPLACEMENT_IMAGE_REQUIRED",
            message: "Choose one replacement PNG.",
          },
        });
        return;
      }
      response.status(201).json({
        data: await service.replaceAnimationFrame(
          frameId,
          {
            buffer: request.file.buffer,
            originalFilename: request.file.originalname,
          },
          metadata.notes,
          metadata.actor,
        ),
      });
    }),
  );

  app.post("/api/animations/:animationId/approve", (request, response) => {
    const animationId = uuidParameterSchema.parse(request.params.animationId);
    const input = approveAnimationInputSchema.parse(request.body);
    response.json({ data: service.approveAnimation(animationId, input) });
  });

  app.get(
    "/api/creatures/:creatureId/validation-report",
    (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      const animationId = request.query.animationId
        ? uuidParameterSchema.parse(request.query.animationId)
        : undefined;
      response.json({
        data: service.getValidationReport(creatureId, animationId),
      });
    },
  );

  app.get("/api/creatures/:creatureId/exports", (request, response) => {
    const creatureId = uuidParameterSchema.parse(request.params.creatureId);
    response.json({ data: service.listExports(creatureId) });
  });

  app.post(
    "/api/creatures/:creatureId/exports",
    asyncRoute(async (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      const input = exportCreatureInputSchema.parse(request.body);
      response.status(201).json({
        data: await service.exportCreature(creatureId, input),
      });
    }),
  );

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

  app.get(
    "/api/creatures/:creatureId/manifest",
    asyncRoute(async (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      response.json({ data: await service.getDesignManifest(creatureId) });
    }),
  );

  app.patch(
    "/api/creatures/:creatureId/manifest",
    asyncRoute(async (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      const input = designManifestInputSchema.parse(request.body);
      response.json({
        data: await service.saveDesignManifest(creatureId, input),
      });
    }),
  );

  app.post(
    "/api/creatures/:creatureId/design-lock",
    asyncRoute(async (request, response) => {
      const creatureId = uuidParameterSchema.parse(request.params.creatureId);
      const input = lockDesignInputSchema.parse(request.body);
      response.json({ data: await service.lockDesign(creatureId, input) });
    }),
  );

  app.post("/api/creatures/:creatureId/design-unlock", (request, response) => {
    const creatureId = uuidParameterSchema.parse(request.params.creatureId);
    const input = unlockDesignInputSchema.parse(request.body);
    response.json({ data: service.unlockDesign(creatureId, input) });
  });

  app.get("/api/creatures/:creatureId/history", (request, response) => {
    const creatureId = uuidParameterSchema.parse(request.params.creatureId);
    response.json({ data: service.getDesignHistory(creatureId) });
  });

  app.get(
    "/api/creatures/:creatureId/locked-design",
    (request, response, next) => {
      try {
        const creatureId = uuidParameterSchema.parse(request.params.creatureId);
        const media = service.getLockedDesignMedia(creatureId);
        response.type(media.mimeType);
        response.setHeader("Cache-Control", "no-store");
        response.sendFile(media.path, { dotfiles: "allow" }, (error) => {
          if (error) next(error);
        });
      } catch (error) {
        next(error);
      }
    },
  );

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

  app.patch("/api/candidates/:candidateId/rejection", (request, response) => {
    const candidateId = uuidParameterSchema.parse(request.params.candidateId);
    const input = candidateRejectionInputSchema.parse(request.body);
    service.setCandidateRejected(candidateId, input.rejected);
    response.json({ data: { candidateId, rejected: input.rejected } });
  });

  app.delete("/api/candidates/:candidateId", (request, response) => {
    const candidateId = uuidParameterSchema.parse(request.params.candidateId);
    const input = destructiveActionInputSchema.parse(request.body ?? {});
    service.deleteCandidate(candidateId, input.confirmed);
    response.json({ data: { candidateId, deleted: true } });
  });

  app.delete("/api/rounds/:roundId", (request, response) => {
    const roundId = uuidParameterSchema.parse(request.params.roundId);
    const input = destructiveActionInputSchema.parse(request.body ?? {});
    service.deleteRound(roundId, input.confirmed);
    response.json({ data: { roundId, deleted: true } });
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
        response.sendFile(media.path, { dotfiles: "allow" }, (error) => {
          if (error) next(error);
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/references/:referenceId/:kind", (request, response, next) => {
    try {
      const referenceId = uuidParameterSchema.parse(request.params.referenceId);
      const kind = request.params.kind;
      if (kind !== "image" && kind !== "thumbnail") {
        response.status(404).json({
          error: { code: "MEDIA_NOT_FOUND", message: "Media not found." },
        });
        return;
      }
      const media = service.getReferenceMedia(referenceId, kind);
      response.type(media.mimeType);
      response.setHeader("Cache-Control", "private, max-age=3600");
      response.sendFile(media.path, { dotfiles: "allow" }, (error) => {
        if (error) next(error);
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/animation-frames/:frameId/:kind", (request, response, next) => {
    try {
      const frameId = uuidParameterSchema.parse(request.params.frameId);
      const kind = request.params.kind;
      if (kind !== "image" && kind !== "thumbnail") {
        response.status(404).json({
          error: { code: "MEDIA_NOT_FOUND", message: "Media not found." },
        });
        return;
      }
      const media = service.getAnimationFrameMedia(frameId, kind);
      response.type(media.mimeType);
      response.setHeader("Cache-Control", "private, max-age=3600");
      response.sendFile(media.path, { dotfiles: "allow" }, (error) => {
        if (error) next(error);
      });
    } catch (error) {
      next(error);
    }
  });

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
      response.sendFile(media.path, { dotfiles: "allow" }, (error) => {
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
