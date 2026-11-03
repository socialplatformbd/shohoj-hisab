import { z } from "zod";
import { isValidIsoDate } from "./dates";

/** ক্লায়েন্ট ও সার্ভার দুই জায়গাতেই ব্যবহৃত কঠোর স্কিমা */
export const ExtractItemSchema = z.object({
  type: z.enum(["income", "expense"]),
  title: z.string().trim().min(1).max(80),
  amount: z.number().positive().max(9_999_999_999),
  categoryId: z.string().max(100).nullable().optional(),
  date: z
    .string()
    .refine(isValidIsoDate)
    .nullable()
    .optional(),
});

export const ExtractResponseSchema = z.object({
  items: z.array(ExtractItemSchema).max(30),
});

export type ExtractItem = z.infer<typeof ExtractItemSchema>;

export const AiRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("extract"),
    text: z.string().trim().min(1).max(2000),
    today: z.string().refine(isValidIsoDate),
    categories: z
      .array(z.object({ id: z.string().max(100), type: z.enum(["income", "expense"]), name: z.string().max(80) }))
      .max(120),
  }),
  z.object({
    mode: z.literal("chat"),
    question: z.string().trim().min(1).max(500),
    facts: z.string().max(30000),
    lang: z.enum(["bn", "en"]).default("bn"),
  }),
]);

export type AiRequest = z.infer<typeof AiRequestSchema>;
