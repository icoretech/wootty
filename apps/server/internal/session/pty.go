package session

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"syscall"

	"github.com/creack/pty"
)

type ExitInfo struct {
	Code   int `json:"code"`
	Signal int `json:"signal"`
}

type ProcessOptions struct {
	Command string
	Args    []string
	Cwd     string
	Env     map[string]string
	Cols    int
	Rows    int
}

type PtyProcess struct {
	cmd    *exec.Cmd
	pty    *os.File
	dataCh chan string
	exitCh chan ExitInfo
}

func NewPtyProcess(options ProcessOptions) (*PtyProcess, error) {
	if options.Command == "" {
		return nil, errors.New("missing command")
	}

	cmd := exec.Command(options.Command, options.Args...)
	cmd.Dir = options.Cwd
	cmd.Env = envMapToSlice(options.Env)

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Cols: uint16(options.Cols),
		Rows: uint16(options.Rows),
	})
	if err != nil {
		return nil, err
	}

	proc := &PtyProcess{
		cmd:    cmd,
		pty:    ptmx,
		dataCh: make(chan string, 256),
		exitCh: make(chan ExitInfo, 1),
	}

	go proc.readLoop()
	go proc.waitLoop()

	return proc, nil
}

func (p *PtyProcess) Data() <-chan string {
	return p.dataCh
}

func (p *PtyProcess) Exit() <-chan ExitInfo {
	return p.exitCh
}

func (p *PtyProcess) Write(data string) error {
	_, err := p.pty.Write([]byte(data))
	return err
}

func (p *PtyProcess) Resize(cols, rows int) error {
	return pty.Setsize(p.pty, &pty.Winsize{
		Cols: uint16(cols),
		Rows: uint16(rows),
	})
}

func (p *PtyProcess) Kill(sig syscall.Signal) error {
	if p.cmd.Process == nil {
		return nil
	}
	return p.cmd.Process.Signal(sig)
}

func (p *PtyProcess) Close() error {
	return p.pty.Close()
}

func (p *PtyProcess) readLoop() {
	buffer := make([]byte, 4096)
	for {
		n, err := p.pty.Read(buffer)
		if n > 0 {
			p.dataCh <- string(buffer[:n])
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			break
		}
	}
	close(p.dataCh)
}

func (p *PtyProcess) waitLoop() {
	err := p.cmd.Wait()
	state := p.cmd.ProcessState

	exitInfo := ExitInfo{
		Code:   0,
		Signal: 0,
	}
	if state != nil {
		exitInfo.Code = state.ExitCode()
		if status, ok := state.Sys().(syscall.WaitStatus); ok && status.Signaled() {
			exitInfo.Signal = int(status.Signal())
		}
	}
	if err != nil && exitInfo.Code == 0 {
		exitInfo.Code = 1
	}

	_ = p.pty.Close()
	p.exitCh <- exitInfo
	close(p.exitCh)
}

func envMapToSlice(env map[string]string) []string {
	result := make([]string, 0, len(env))
	for key, value := range env {
		result = append(result, key+"="+value)
	}
	return result
}
