# kujira-fin-market-making
Supports market making of [FIN](https://fin.kujira.app/) exchange.

# How does this works?
This code is a server that runs a bot for market making. 
It simply maintains the asset ratio of the current wallet and buys when the price goes down,
and sells when the price goes up.  

> Now only support tested **KUJI/axlUSD** be careful and test with your penny money. 

You can check the transaction log in the channel.
https://t.me/GreenWhaleKujira

# Prerequisites
1. [git](https://git-scm.com/downloads)
2. [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)
3. [pm2](https://www.npmjs.com/package/pm2) (optional)

## nvm
A node is required to run a program. 
If node is not installed on the server, installation through nvm is recommended.

# Install
```bash
git clone https://github.com/kht2199/kujira-fin-market-making.git
cd kujira-fin-market-making
# install libraries.
yarn install
# update `.env.production` configuration for your config.
...
# start application.
yarn start
# or start application with pm2.
pm2 start 'yarn start' --name kuji-market-making-bot
# you can see log lines.
pm2 log
```

# Config
You can change the settings through the website below.   
[https, https://fin.taek.kim](https://fin.taek.kim)  
if your server use `http` protocol, use this link [http://fin.taek.kim](http://fin.taek.kim)
```bash
$ vi env
INTERVAL=10000
# comma separated value. e.g. "keyword1 keyword2, keyword3 keyword4..."
MNEMONIC=""
CHAIN_ID=kaiyo-1
ENDPOINT=https://rpc.kaiyo.kujira.setten.io
ENDPOINT_LCD=https://lcd.kaiyo.kujira.setten.io
TARGET_RATE=
TELEGRAM_BOT=
TELEGRAM_CHAT_ID=
```

## What is each value means?
| name              | description                                                                                                                                                                                                                                       | should modify? |
|-------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------|
| *MNEMONIC         | The key value of the wallet. It can be obtained when creating a wallet. If exposed, you may lose ownership of your wallet, so be careful.                                                                                                         | Y              |
| *ORDER_AMOUNT_MIN | It happens that too few quantities are valued at a certain price. A small amount can be ignored as the commission can increase as the number of orders.                                                                                           | Y              |
| CHAIN_ID          | Testnet or Mainnet ID                                                                                                                                                                                                                             | N              |
| ENDPOINT          | RPC server address                                                                                                                                                                                                                                | N              |
| ENDPOINT_LCD      | LCD server address                                                                                                                                                                                                                                | N              |
| INTERVAL          | An application has one state value. According to the scheduling, the code according to the state is executed, and it is an interval for the schedule.                                                                                             | N              |
| TELEGRAM_BOT      | Telegram bot ID to send transaction details                                                                                                                                                                                                       | N              |
| TELEGRAM_CHAT_ID  | Telegram chat ID to receive transaction details                                                                                                                                                                                                   | N              |

# Everyone has a plan. Of course, I am too
- ✅ KUJI/axlUSDC
- ✅ Webpage
  - ✅ Configuration
- ✅ Support multiple wallet
- Websocket Support for Performance
- wETH/axlUSDC
- Use Database for all data
  - Statistics
    - daily/monthly valuation change
- Create apis for data
- UI for statistics
- Support combine with CEX
- Client Application. 
  - I'm considering [tauri](https://tauri.app/) framework.

# Troubleshooting
If the library does not downloaded. `kujira.js`
```bash
# try this, and restart your application.
rm yarn.lock && rm -rf node_modules && yarn
```
![img.png](https://cdn.discordapp.com/attachments/1001151256863191071/1001416928721641593/Screenshot_2022-07-26_at_5.12.21_PM.png)


# Donation
delegate $KUJI to [Seoul Forest Node](https://blue.kujira.app/stake/kujiravaloper1ewcnz9w06u0xpqh9varg87rwnu4hy763uuxz6t)  
