function parseForecastMsg(e) {
    if(e.rainProbability != undefined){
        return `地區：${e.area}
時間：${e.time}
描述：${e.weatherDescription} ${e.feelingDesciption}
最高溫度：${e.maxTemp}℃
最低溫度：${e.minTemp}℃
降雨機率：${e.rainProbability}%
---
資料來源：中央氣象局
`;
    }else{
        return `地區：${e.area}
時間：${e.time}
描述：${e.weatherDescription}
最高溫度：${e.maxTemp}℃
最低溫度：${e.minTemp}℃
---
資料來源：中央氣象局
`;
    }
}

module.exports = parseForecastMsg;