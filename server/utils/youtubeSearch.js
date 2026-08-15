const https = require('https');

function searchYouTube(query) {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const regex = /ytInitialData\s*=\s*({[\s\S]+?});/;
          const match = data.match(regex);
          if (!match) {
            return reject(new Error('ytInitialData not found'));
          }
          
          const json = JSON.parse(match[1]);
          const resultsRenderer = json.contents?.twoColumnSearchResultsRenderer;
          if (!resultsRenderer) {
            return reject(new Error('twoColumnSearchResultsRenderer not found'));
          }

          const sectionList = resultsRenderer.primaryContents?.sectionListRenderer;
          if (!sectionList || !sectionList.contents) {
            return reject(new Error('sectionListRenderer contents not found'));
          }

          const firstContent = sectionList.contents[0];
          if (!firstContent || !firstContent.itemSectionRenderer || !firstContent.itemSectionRenderer.contents) {
            return reject(new Error('itemSectionRenderer contents not found'));
          }

          const items = firstContent.itemSectionRenderer.contents;
          const videos = [];

          for (const item of items) {
            if (item.videoRenderer) {
              const vr = item.videoRenderer;
              const videoId = vr.videoId;
              
              let title = "Unknown Title";
              if (vr.title && vr.title.runs && vr.title.runs[0]) {
                title = vr.title.runs[0].text;
              }

              let author = "Unknown Artist";
              if (vr.ownerText && vr.ownerText.runs && vr.ownerText.runs[0]) {
                author = vr.ownerText.runs[0].text;
              }

              const duration = vr.lengthText ? vr.lengthText.simpleText : 'Unknown';
              const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
              
              videos.push({
                id: videoId,
                title,
                author,
                duration,
                thumbnail
              });
            }
          }
          resolve(videos);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = searchYouTube;
