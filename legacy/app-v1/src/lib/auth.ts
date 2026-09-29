import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@evoly/db";
import { loginSchema } from "@evoly/core/auth";

// NextAuth/PrismaAdapter envoie `image` mais notre schéma utilise `avatarUrl`.
// On surcharge createUser et updateUser pour faire le mapping.
function customAdapter() {
  const base = PrismaAdapter(db);
  return {
    ...base,
    createUser: (data: any) => {
      const { image, ...rest } = data;
      return db.user.create({ data: { ...rest, avatarUrl: image ?? null } });
    },
    updateUser: (data: any) => {
      const { image, ...rest } = data;
      return db.user.update({
        where: { id: rest.id },
        data: { ...rest, ...(image !== undefined && { avatarUrl: image }) },
      });
    },
    getUser: async (id: string) => {
      const user = await db.user.findUnique({ where: { id } });
      if (!user) return null;
      return { ...user, image: user.avatarUrl };
    },
    getUserByEmail: async (email: string) => {
      const user = await db.user.findUnique({ where: { email } });
      if (!user) return null;
      return { ...user, image: user.avatarUrl };
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: customAdapter(),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await db.user.findUnique({ where: { email } });

        if (!user || !user.passwordHash) return null;

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) return null;

        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
      }
      if (trigger === "update" && session?.lastOrganizationId) {
        token.lastOrganizationId = session.lastOrganizationId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      if (token.lastOrganizationId) {
        session.lastOrganizationId = token.lastOrganizationId as string;
      }
      return session;
    },
    async signIn({ user, account }) {
      if (account?.provider !== "credentials") {
        return true;
      }
      return true;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id && user.email) {
        await db.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
      }
    },
  },
});
