declare module "spark-md5" {
    class SparkArrayBuffer {
        append(buffer: ArrayBuffer): void;
        end(raw?: boolean): string;
        destroy(): void;
    }

    class SparkMD5 {
        append(str: string): void;
        end(raw?: boolean): string;
        destroy(): void;
        static hash(str: string, raw?: boolean): string;
        static hashBinary(content: string, raw?: boolean): string;
        static ArrayBuffer: typeof SparkArrayBuffer;
    }

    export = SparkMD5;
}
