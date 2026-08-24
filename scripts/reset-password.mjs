import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const newPassword = "Admin@12345";

async function resetPassword() {
  const hash = await bcrypt.hash(newPassword, 10);
  const result = await prisma.user.updateMany({
    where: { email: "admin@example.com" },
    data: { passwordHash: hash },
  });
  console.log(`Updated ${result.count} user(s). Password set to: ${newPassword}`);
  await prisma.$disconnect();
}

resetPassword().catch((e) => {
  console.error(e);
  process.exit(1);
});
