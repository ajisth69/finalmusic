const http = require('http');

const videoId = '1bxbDkKmTjk'; // Shatir 2

const options = {
    hostname: 'localhost',
    port: 3000,
    path: `/play/${videoId}`,
    method: 'GET',
};

console.log(`Testing /play/${videoId}...`);

const req = http.request(options, (res) => {
    let data = '';
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Response:', JSON.stringify(json, null, 2));

            // Now test the stream
            console.log('\nTesting stream...');
            const streamReq = http.request({
                hostname: 'localhost',
                port: 3000,
                path: `/stream/${videoId}`,
                method: 'GET',
            }, (streamRes) => {
                console.log(`Stream STATUS: ${streamRes.statusCode}`);
                console.log(`Stream Content-Type: ${streamRes.headers['content-type']}`);
                console.log(`Stream Content-Length: ${streamRes.headers['content-length']}`);

                let bytes = 0;
                streamRes.on('data', (chunk) => {
                    bytes += chunk.length;
                    if (bytes > 10000) {
                        console.log(`Received ${bytes} bytes - stream working!`);
                        streamReq.destroy();
                    }
                });
                streamRes.on('end', () => {
                    console.log(`Stream ended. Total bytes: ${bytes}`);
                });
            });
            streamReq.on('error', (e) => {
                console.error('Stream error:', e.message);
            });
            streamReq.end();

        } catch (e) {
            console.log('Raw response:', data);
        }
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
