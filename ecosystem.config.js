module.exports = {
  apps : [{
    name   : "kuji",
    script : "yarn start"
  }, {
    name   : "prisma-studio",
    script : "dotenv -e env -- npx prisma studio"
  }]
}