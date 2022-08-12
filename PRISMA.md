
# commands
```bash
# push
dotenv -e env -- npx prisma db push
dotenv -e .env.development -- npx prisma db push
# studio
dotenv -e .env.development -- npx prisma studio
```