import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';

class BinaryNotFoundError extends Error {
    constructor(binaryPath: string) {
        super(`Pieuvre binary not found at: ${binaryPath}`);
        this.name = 'BinaryNotFoundError';
        // Maintains proper stack trace in V8 (Node/Chrome)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, BinaryNotFoundError);
        }
    }
}

export class PieuvreProver {
    public outputChannel: vscode.OutputChannel;

    private process: ChildProcess | null = null;
    private restartPromise: Promise<void> | null = null;

    constructor() {
        this.outputChannel =
            vscode.window.createOutputChannel('Pieuvre Prover');
    }

    async start(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('vspieuvre');
        const binaryPath = config.get<string>('pieuvre Binary.Path');
        const flags = config
            .get<string>('pieuvre Binary.Flags', '')
            .split(' ')
            .filter((x) => x.length > 0);

        try {
            if (!binaryPath) {
                throw new BinaryNotFoundError(
                    'Pieuvre binary path not configured',
                );
            }
            this.process = spawn(binaryPath, flags, { stdio: 'pipe' });

            this.process.stdout?.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });

            this.process.stderr?.on('data', (data) => {
                this.outputChannel.append(`ERROR: ${data}`);
            });

            this.process.on('close', (code) => {
                this.outputChannel.appendLine(
                    `Prover exited with code ${code}`,
                );
            });

            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to start Pieuvre: ${error}`);
            return false;
        }
    }

    public async restart(): Promise<void> {
        if (this.restartPromise) return this.restartPromise;

        this.stop();

        this.restartPromise = this.start().then((_) => {
            this.restartPromise = null;
        });

        return this.restartPromise;
    }

    async sendCommand(command: string): Promise<string> {
        if (!this.process) {
            throw new Error('Prover not initialized');
        }

        return new Promise((resolve) => {
            const listener = (data: Buffer) => {
                const output = data.toString();
                this.process?.stdout?.off('data', listener);
                resolve(output);
            };

            this.process?.stdout?.on('data', listener);
            this.process?.stdin?.write(`${command.replaceAll('\n', ' ')}\n`);
        });
    }

    stop() {
        this.process?.kill();
        this.outputChannel.dispose();
    }
}
