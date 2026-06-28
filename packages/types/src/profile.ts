import { z } from "zod"

export const UserRoleSchema = z.enum(["user", "admin"])
export type UserRole = z.infer<typeof UserRoleSchema>
export const UserRoleLabels: Record<UserRole, { id: string; en: string }> = {
  user: { id: "Pengguna", en: "User" },
  admin: { id: "Admin", en: "Admin" },
}

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  role: UserRoleSchema,
  full_name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  bio: z.string().max(500).nullable(),
  company_name: z.string().max(100).nullable(),
  city: z.string().max(100).nullable(),
  province: z.string().max(100).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type Profile = z.infer<typeof ProfileSchema>

export const UpdateProfileSchema = ProfileSchema.pick({
  full_name: true,
  phone: true,
  bio: true,
  company_name: true,
  city: true,
  province: true,
}).partial()
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>

export const RegisterSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .regex(/[A-Z]/, "Harus ada huruf kapital")
    .regex(/[0-9]/, "Harus ada angka"),
  full_name: z.string().min(2, "Nama minimal 2 karakter").max(100),
  phone: z.string().optional(),
})
export type Register = z.infer<typeof RegisterSchema>

export const LoginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
})
export type Login = z.infer<typeof LoginSchema>
