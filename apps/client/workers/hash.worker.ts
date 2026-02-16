/// <reference lib="webworker" />
import SparkMD5 from "spark-md5";

self.onmessage = (e: MessageEvent<{ chunk: Blob; id: number }>) => {
    const { chunk, id } = e.data;
    const reader = new FileReader();
    const spark = new SparkMD5.ArrayBuffer();

    reader.onload = (event) => {
        if (event.target?.result) {
            spark.append(event.target.result as ArrayBuffer);
            // Return raw binary string converted to base64
            const rawHash = spark.end(true);
            const base64 = btoa(rawHash);
            self.postMessage({ id, md5: base64 });
        } else {
            self.postMessage({ id, error: "Failed to read chunk" });
        }
    };

    reader.onerror = () => {
        self.postMessage({ id, error: "FileReader error" });
    };

    reader.readAsArrayBuffer(chunk);
};
