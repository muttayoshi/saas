import { z } from "zod"

// Pagination
export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(12),
})
export type Pagination = z.infer<typeof PaginationSchema>

// API response wrappers
export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string().optional(),
  })

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
})

export type ApiError = z.infer<typeof ApiErrorSchema>

// Language / locale
export const LocaleSchema = z.enum(["id", "en"])
export type Locale = z.infer<typeof LocaleSchema>
