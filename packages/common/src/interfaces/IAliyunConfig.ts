export interface IAliyunConfig {
	accessKeyId: string;
	accessKeySecret: string;
	region: string;
	oss: {
		bucket: string;
		endpoint: string;
	};
}
