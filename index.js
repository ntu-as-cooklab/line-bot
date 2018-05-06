const config = require('./config');

// chatroom platform framework
const {
    LineBot,
    MessengerBot
} = require('bottender');

const bot = (config.chatroomPlatform == 'messenger') ?
    new MessengerBot({
        accessToken: config.messengerAccessToken,
        appSecret: config.messengerAppSecret,
    }) : new LineBot({
        channelSecret: config.channelSecret,
        accessToken: config.channelAccessToken
    });

const {
    createServer
} = require('bottender/express');

// third parties
const axios = require("axios");
const segment = require('./lib/segment');
const parseTime = require('./lib/parseTime');
const imagedb = require('./lib/imagedb');
const {
    getAreaWeather,
} = require('./lib/areaWeather');
const {
    isAir,
    isWeather,
    isObservation,
    isFunny,
    isAirStation,
    isForeignAirStation,
    isTaiwanArea
} = require('./lib/keywords');
const messagedb = require('./lib/messagedb');
const getForeignAirData = require('./lib/ForeignAir');
const parseForeAirStMsg = require('./message/parseForeignAirMsg');

async function platformReplyText(context, messenge) {
    if (config.chatroomPlatform == 'messenger') {
        await context.sendText(messenge)
    } else {
        await context.replyText(messenge);
    }
}

async function platformReplyImage(context, url) {
    if (config.chatroomPlatform == 'messenger') {
        await context.sendImage(url)
    } else {
        await context.replyImage(url);
    }
}

bot.onEvent(async context => {
    if (context.event.isFollow) {
        await platformReplyText(context,
            require('./message/followMsg')
        );
    } else if (context.event.isJoin) {
        await platformReplyText(context,
            require('./message/joinMsg')
        );
    } else if (context.event.isText) {
        let msg = context.event.text;
        // record all message
        messagedb.write(msg);
        // trim space and change charactor
        msg = msg.replace(/\s/g, '');
        msg = msg.replace(/台/g, '臺');
        const weatherKeyword = isWeather(msg);
        const airKeyword = isAir(msg);
        const funnyReply = isFunny(msg);

        if (msg.toLowerCase().includes("help")) {
            await platformReplyText(context,
                require('./message/helpMsg')
            );
        } else if (msg.toLowerCase().includes("issue") || msg.includes("回報問題")) {
            await platformReplyText(context,
                require('./message/issueMsg')
            );
        } else if (msg.toLowerCase().includes("github") || msg.includes("原始碼")) {
            await platformReplyText(context, "https://github.com/ntu-as-cooklab/line-bot");
        } else if (msg.toLowerCase().includes("cwb") || msg.includes("氣象局")) {
            await platformReplyText(context, "www.cwb.gov.tw/");
        } else if (msg.includes("觀測站清單")) {
            await platformReplyText(context,
                require('./message/obsStMsg')
            );
        } else if (msg.includes("觀測")) {
            let replyMsg = '';
            const parseObsStMsg = require('./message/parseObsStMsg');
            const stationName = msg.split('觀測')[0];
            try {
                const res = await axios.get('http://140.112.67.183/mospc/returnJson.php?file=CWBOBS.json');
                const data = res.data;
                const results = [];
                //  find candidates stations
                data.forEach(e => {
                    if (e.name.includes(stationName)) {
                        results.push(e);
                    }
                })
                // choose candidates for precise name
                results.forEach(e => {
                    if (e.name == stationName) {
                        replyMsg = parseObsStMsg(e);
                    }
                })
                // choose candidates for approximative name
                if (replyMsg == '') {
                    results.forEach(e => {
                        if (e.name.includes(stationName)) {
                            replyMsg = parseObsStMsg(e);
                        }
                    })
                }
                if (replyMsg == '') {
                    replyMsg = `無此測站，請輸入「觀測站清單」尋找欲查詢測站`;
                }
            } catch (err) {
                console.log("input text: ", msg);
                console.log(err);
                replyMsg = '取得資料失敗';
            }
            await platformReplyText(context, replyMsg);
        } else if (msg.includes("監測站清單")) {
            await platformReplyText(context,
                require('./message/airStMsg')
            );
        } else if (airKeyword) {
            // If there is a staton, return detail data
            const stationName = isAirStation(msg);
            let foreignStation = null;
            if (ststionName == null) {
                foreignStation = await isForeignAirStation(msg);
            }
            if (stationName) {
                let replyMsg = '';
                const epoch = new Date().getMilliseconds();
                const url = `https://taqm.epa.gov.tw/taqm/aqs.ashx?lang=tw&act=aqi-epa&ts=${epoch}`;
                try {
                    const res = await axios.get(url);
                    const data = res.data;
                    data['Data'].forEach(e => {
                        if (e.SiteName.includes(stationName)) {
                            replyMsg = require('./message/parseAirStMsg')(e);
                        }
                    })
                } catch (err) {
                    console.log("input text: ", msg);
                    console.log(err);
                    replyMsg = '取得資料失敗';
                }
                await platformReplyText(context, replyMsg);
            } else if (foreignStation == null) { // else return taiwan air image
                const url = await require('./lib/createAirImage')();
                if (url != null) {
                    await platformReplyImage(context, url);
                } else {
                    // if get imgur image url fail, just reply in text
                    await platformReplyText(context, "取得空氣品質圖失敗。請輸入[監測站清單]來查詢詳細數值。");
                }
            } else {
                const AirData = await getForeignAirData(foreignStation);
                if (Airdata != null) {
                    replyMsg += parseForeAirStMsg(AirData);
                } else {
                    replyMsg = '取得資料失敗';
                }
            }
        } else if (msg.includes("預報")) {
            const d = parseTime();
            const dbKey = `${d.year}${d.month}${d.day}${d.hour}`;
            const imgUrl = 'http://www.cwb.gov.tw/V7/forecast/taiwan/Data/Forecast01.png';
            const url = await imagedb('forecast', dbKey, imgUrl)
            if (url != null) {
                await platformReplyImage(context, url);
            } else {
                // if get imgur image url fail, just reply in text
                await platformReplyText(context, imgUrl);
            }
        } else if (msg.includes("天氣圖")) {
            const d = parseTime();
            const dbKey = `${d.year}${d.month}${d.day}${d.hour}`;
            const imgUrl = 'http://www.cwb.gov.tw/V7/forecast/fcst/Data/I04.jpg';
            const url = await imagedb('weather', dbKey, imgUrl);
            if (url != null) {
                await platformReplyImage(context, url);
            } else {
                // if get imgur image url fail, just reply in text                
                await platformReplyText(context, imgUrl);
            }
        } else if (msg.includes("雷達")) {
            const d = parseTime();
            const time = `${d.year}${d.month}${d.day}${d.hour}${d.minute}`;
            const imgUrl = `http://www.cwb.gov.tw/V7/observe/radar/Data/HD_Radar/CV1_3600_${time}.png`;
            const url = await imagedb('radar', time, imgUrl);
            if (url != null) {
                await platformReplyImage(context, url);
            } else {
                // if get imgur image url fail, just reply in text                
                await platformReplyText(context, imgUrl);
            }
        } else if (msg.includes("衛星雲")) {
            const d = parseTime();
            const time = `${d.year}-${d.month}-${d.day}-${d.hour}-${d.minute}`;
            const dbKey = `${d.year}${d.month}${d.day}${d.hour}${d.minute}`;
            const imgUrl = `http://www.cwb.gov.tw/V7/observe/satellite/Data/ts1p/ts1p-${time}.jpg`;
            const url = await imagedb('satellite', dbKey, imgUrl);
            if (url != null) {
                await platformReplyImage(context, url);
            } else {
                // if get imgur image url fail, just reply in text
                await platformReplyText(context, imgUrl);
            }
        } else if (msg.includes("地震")) {
            const url = await require('./lib/getEarthquake')();
            if (url != null) {
                await platformReplyImage(context, url);
            } else {
                // if get imgur image url fail, just reply in text
                await platformReplyText(context, "取得最新資料失敗。請上 http://www.cwb.gov.tw/V7/earthquake/ 查詢");
            }
        } else if (msg.includes('概況')) {
            const table = require('./data/overviewID');
            const areaName = msg.split('概況')[0];
            let replyMsg = '';
            for (areaID in table) {
                if (table[areaID].includes(areaName)) {
                    try {
                        const res = await axios.get(`http://www.cwb.gov.tw/V7/forecast/taiwan/Data/${areaID}.txt`);
                        const data = res.data;
                        replyMsg = data.replace(/<BR>/g, '\n');
                        replyMsg = replyMsg.split('<div')[0];
                    } catch (err) {
                        console.log("input text: ", msg);
                        console.log(err);
                        replyMsg = '取得資料失敗';
                    }
                    await platformReplyText(context, replyMsg);
                }
            }
        } else if (funnyReply) {
            await platformReplyText(context, funnyReply);
        } else if (weatherKeyword) {
            let area = null;
            area = isTaiwanArea(msg);
            if (area == null) {
                area = {};
                area['name'] = msg.split(weatherKeyword)[0];
            }
            const replyMsg = await getAreaWeather(area);
            await platformReplyText(context, replyMsg);
        }
    }
});

const server = (config.chatroomPlatform == 'messenger') ?
    createServer(bot, {
        verifyToken: config.messengerVerifyToken
    }) : createServer(bot);

server.listen(process.env.PORT || 5000, () => {
    console.log('server is running on 5000 port...');
});