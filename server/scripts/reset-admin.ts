/**
 * Create the admin account, or reset its password and re-activate it.
 *   DATABASE_URL=... ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run admin:reset
 * (The seed script only creates a missing admin; it never changes an existing password.)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
if (!email || password.length < 8) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters).');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN', status: 'ACTIVE' },
    create: { name: 'Administrator', email, role: 'ADMIN', passwordHash },
  });
  console.log(`Admin ready: ${user.email} (role ${user.role}). Sign in with the password you just set.`);
} finally {
  await prisma.$disconnect();
}
