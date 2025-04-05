# SUMMARY

[![NPM Version](https://img.shields.io/npm/v/serialport-bindings-webserial)](https://www.npmjs.com/package/serialport-bindings-webserial)

NodeJS sockets bindings for [serialport](https://www.npmjs.com/package/serialport) module.

# INSTALL
```sh
npm i serialport-bindings-socket
yarn add serialport-bindings-socket
pnpm add serialport-bindings-socket
```

# EXAMPLES  ```
1. Open tcp client port:
    
    The browser will show pop-up with all available ports.
    ```js
    import { SocketBinding, SocketBindingInterface } from 'serialport-bindings-webserial';
    import { SerialPortStream } from '@serialport/stream';
    
    const port = new SerialPortStream<SocketBindingInterface>({
        binding: SocketBinding,
        path: 'tcp://127.0.1.9999', // for unix: unix-server:///path/to/server.sock
        baudRate: 115200, // dummy
    });
    ```
2. Open tcp server port:

   The browser will show pop-up with all available ports.
    ```js
    import { SocketBinding, SocketBindingInterface } from 'serialport-bindings-webserial';
    import { SerialPortStream } from '@serialport/stream';
    
    const port = new SerialPortStream<SocketBindingInterface>({
        binding: SocketBinding,
        path: 'tcp-server://127.0.1.9999', // for unix: unix-server:///path/to/server.sock
        baudRate: 115200, // dummy
    });
    ```
