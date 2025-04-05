import {
	BindingInterface,
	BindingPortInterface,
	OpenOptions,
	PortStatus,
	SetOptions,
	UpdateOptions
} from '@serialport/bindings-interface';
import * as net from "node:net";
import * as fs from "node:fs";

export type SocketBindingInterface = BindingInterface;

export class SocketPortBinding implements BindingPortInterface {
	readonly openOptions: Required<OpenOptions>;
	isOpen = false;
	private server?: net.Server;
	private client?: net.Socket;
	private lastWriteCall?: Promise<void>;
	private readonly url: URL;
	private internalBuffer = Buffer.alloc(0);

	constructor(url: URL, openOptions: Required<OpenOptions>) {
		this.url = url;
		this.openOptions = openOptions;
	}

	async open(): Promise<void> {
		const protocol = this.url.protocol.replace(/:$/, '');
		const isServer = protocol.endsWith('-server');

		if (!this.url.protocol)
			throw new Error("Socket protocol is not specified!");

		await new Promise<void>((resolve, reject) => {
			const onError = (err?: any) => reject(err);

			if (protocol == "tcp" || protocol == "tcp-server") {
				if (!this.url.hostname) {
					reject(new Error("Socket hostname is not specified!"));
					return;
				}

				if (!this.url.port) {
					reject(new Error("Socket port is not specified!"));
					return;
				}

				const host = this.url.hostname;
				const port = parseInt(this.url.port);

				if (isServer) {
					const socket = net.createServer((client) => {
						if (this.client)
							this.client.end();
						this.client = client;
						socket.off('error', onError);
						resolve();
					});
					socket.on('error', onError);
					socket.listen(port, host);
					this.server = socket;
				} else {
					const socket = net.createConnection({ port, host }, () => {
						this.client = socket;
						socket.off('error', onError);
						resolve();
					});
					socket.on('error', onError);
				}
			} else if (protocol == "unix" || protocol == "unix-server") {
				if (!this.url.pathname) {
					reject(new Error("UNIX socket path is not specified!"));
					return;
				}

				const path = this.url.pathname;
				if (isServer) {
					if (fs.existsSync(path))
						fs.unlinkSync(path);

					const socket = net.createServer((client) => {
						if (this.client)
							this.client.end();
						this.client = client;
						socket.off('error', onError);
						resolve();
					});
					socket.on('error', onError);
					socket.listen(path);
					this.server = socket;
				} else {
					const socket = net.createConnection(path, () => {
						this.client = socket;
						socket.off('error', onError);
						resolve();
					});
					socket.on('error', onError);
				}
			} else {
				reject(new Error(`Unsupported protocol: ${protocol}`));
			}
		});
		this.isOpen = true;
	}

	async close(): Promise<void> {
		if (this.isOpen) {
			this.client?.end();
			this.server?.close();
			this.client = undefined;
			this.server = undefined;
		}
	}

	async getBaudRate(): Promise<{baudRate: number}> {
		// stub
		return { baudRate: this.openOptions.baudRate };
	}

	async update(_: UpdateOptions): Promise<void> {
		// stub
	}

	async write(buffer: Buffer): Promise<void> {
		if (!this.client)
			throw new Error("Not connected!");
		this.lastWriteCall = new Promise<void>((resolve, reject) => {
			this.client!.write(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), (err) => err ? reject(err) : resolve());
		});
		return this.lastWriteCall;
	}

	async read(buffer: Buffer, offset: number, length: number): Promise<{buffer: Buffer, bytesRead: number}> {
		// Reuse redundant data from previous read.
		let readBytesFromInternalBuffer = 0;
		if (this.internalBuffer.length > 0) {
			const availFromBuffer = Math.min(length, this.internalBuffer.length);

			buffer.set(this.internalBuffer.subarray(0, availFromBuffer), offset);

			length -= availFromBuffer;
			offset += availFromBuffer;
			readBytesFromInternalBuffer += availFromBuffer;

			this.internalBuffer = this.internalBuffer.subarray(availFromBuffer);

			if (!length)
				return { buffer, bytesRead: readBytesFromInternalBuffer };
		}

		if (!this.client)
			throw new Error("Not connected!");

		const client = this.client;
		return new Promise((resolve, reject) => {
			const removeListeners = () => {
				client.removeListener("close", onClose);
				client.removeListener("end", onEnd);
				client.removeListener("error", onError);
				client.removeListener("readable", onReadable);
			};
			const onClose = () => {
				removeListeners();
				resolve({buffer: buffer, bytesRead: 0});
			};
			const onEnd = () => {
				removeListeners();
				resolve({buffer: buffer, bytesRead: 0});
			};
			const onError = (err: Error) => {
				removeListeners();
				reject(err);
			};
			const onReadable = () => {
				let chunk = client.read();
				if (chunk == null) {
					removeListeners();
					resolve({buffer: buffer, bytesRead: 0});
				} else if (chunk.length > length) {
					// A possibly impossible case when WebSerial returns more data than "node-serial" was requested.
					// We just save any redundant data in an internal buffer and return it on the next read.
					buffer.set(chunk.slice(0, length), offset);

					const redundantBytes = chunk.slice(length);

					const newInternalBuffer = Buffer.alloc(this.internalBuffer.length + redundantBytes.length)
					newInternalBuffer.set(this.internalBuffer, 0);
					newInternalBuffer.set(redundantBytes, this.internalBuffer.length);
					this.internalBuffer = newInternalBuffer;

					removeListeners();
					resolve({ buffer, bytesRead: readBytesFromInternalBuffer + length });
				} else {
					buffer.set(chunk, offset);
					removeListeners();
					resolve({ buffer, bytesRead: readBytesFromInternalBuffer + chunk.length });
				}
			};
			client.on("close", onClose);
			client.on("end", onEnd);
			client.on("error", onError);
			client.on("readable", onReadable);
		});
	}

	async drain(): Promise<void> {
		if (this.lastWriteCall) {
			await this.lastWriteCall;
			this.lastWriteCall = undefined;
		}
	}

	async flush(): Promise<void> {
		this.client?.read(0x100000000);
	}

	async set(_: SetOptions): Promise<void> {
		// stub
	}

	async get(): Promise<PortStatus> {
		// stub
		return {
			cts:		true,
			dsr:		true,
			dcd:		false,
		};
	}
}

export const SocketBinding: BindingInterface<SocketPortBinding> = {
	async open(options) {
		let binding: SocketPortBinding | undefined;

		const openOptions: Required<OpenOptions> = {
			dataBits: 8,
			lock: true,
			stopBits: 1,
			parity: 'none',
			rtscts: false,
			xon: false,
			xoff: false,
			xany: false,
			hupcl: true,
			...options
		};

		const url = new URL(openOptions.path);
		binding = new SocketPortBinding(url, openOptions);
		await binding.open();
		return binding;
	},

	async list() {
		return [];
	},
};

export default SocketBinding;
