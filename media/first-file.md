# Your first Fly file

Create a file named `hello.fly` with this content:

```fly
import fly.os.io

void main() {
    io.printLn("Hello, Fly!")
}
```

As you type you will see:
- **Syntax highlighting** colour your code
- **Hover docs** when you hover over `io`, `printLn`, or any keyword
- **Completions** appear after `io.` — press `Tab` to accept

Press **Ctrl+F5** to compile and run the program in the integrated terminal.
