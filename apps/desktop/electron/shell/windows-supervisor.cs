// Invariants: assign the Job atomically at creation, prohibit breakaway, and confirm an empty Job before reporting exit.
// The Job handle is not inherited. Its closure kills descendants even if the worker or supervisor crashes.
using System;
using System.ComponentModel;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;

namespace Bosi {
    public static class ShellSupervisor {
        [DataContract]
        class Configuration {
            [DataMember(IsRequired = true)] public string executable = null;
            [DataMember(IsRequired = true)] public string cwd = null;
            [DataMember(IsRequired = true)] public string script = null;
            [DataMember(IsRequired = true)] public string pipe = null;
            [DataMember(IsRequired = true)] public string token = null;
        }

        public static int Main(string[] args) {
            Console.InputEncoding = new UTF8Encoding(false);
            Console.OutputEncoding = new UTF8Encoding(false);
            if (args.Length == 1 && args[0] == "--check") {
                Console.WriteLine("{\"protocol\":1,\"pointerSize\":" + IntPtr.Size + "}");
                return 0;
            }
            try {
                // Configuration and the pipe token never appear in process arguments.
                var line = Console.In.ReadLine();
                if (line == null) return 1;
                using (var input = new MemoryStream(Encoding.UTF8.GetBytes(line))) {
                    var config = (Configuration)new DataContractJsonSerializer(typeof(Configuration)).ReadObject(input);
                    return Run(config.executable, config.cwd, config.script, config.pipe, config.token);
                }
            } catch (Exception exception) {
                Console.Error.WriteLine(exception.Message);
                return 1;
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        struct BasicLimits {
            public long ProcessTime, JobTime;
            public uint Flags;
            public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }
        [StructLayout(LayoutKind.Sequential)]
        struct IoCounters {
            public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
        }
        [StructLayout(LayoutKind.Sequential)]
        struct ExtendedLimits {
            public BasicLimits Basic;
            public IoCounters Io;
            public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
        }
        [StructLayout(LayoutKind.Sequential)]
        struct Accounting {
            public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
            public uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct StartupInfo {
            public uint Size;
            public string Reserved, Desktop, Title;
            public uint X, Y, XSize, YSize, XChars, YChars, FillAttribute, Flags;
            public ushort ShowWindow, ReservedSize;
            public IntPtr ReservedData, Input, Output, Error;
        }
        [StructLayout(LayoutKind.Sequential)]
        struct StartupInfoEx { public StartupInfo Startup; public IntPtr Attributes; }
        [StructLayout(LayoutKind.Sequential)]
        struct ProcessInfo { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern IntPtr CreateJobObjectW(IntPtr attributes, IntPtr name);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits info, uint size);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool QueryInformationJobObject(IntPtr job, int infoClass, out Accounting info, uint size, IntPtr length);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool TerminateJobObject(IntPtr job, uint code);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes,
            IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string cwd,
            ref StartupInfoEx startup, out ProcessInfo process);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute,
            IntPtr value, IntPtr size, IntPtr previous, IntPtr returnedSize);
        [DllImport("kernel32.dll")]
        static extern void DeleteProcThreadAttributeList(IntPtr list);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetExitCodeProcess(IntPtr process, out uint code);
        [DllImport("kernel32.dll")]
        static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll")]
        static extern IntPtr GetStdHandle(int id);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess,
            out IntPtr target, uint access, bool inherit, uint options);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr attributes,
            uint creation, uint flags, IntPtr template);
        [DllImport("kernel32.dll")]
        static extern bool CloseHandle(IntPtr handle);

        static void Check(bool success) {
            if (!success) throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        static IntPtr Inherit(IntPtr handle) {
            IntPtr copy;
            Check(DuplicateHandle(GetCurrentProcess(), handle, GetCurrentProcess(), out copy, 0, true, 2));
            return copy;
        }
        static bool Empty(IntPtr job) {
            Accounting info;
            Check(QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero));
            return info.ActiveProcesses == 0;
        }
        static void Receipt(StreamWriter writer, string state, int code) {
            writer.Write("{\"version\":1,\"state\":\"" + state + "\",\"coverage\":\"descendants\",\"exitCode\":" + code + "}");
            writer.Flush();
        }

        public static int Run(string executable, string cwd, string script, string pipe, string token) {
            IntPtr job = IntPtr.Zero, attributes = IntPtr.Zero, handles = IntPtr.Zero;
            IntPtr input = IntPtr.Zero, output = IntPtr.Zero, error = IntPtr.Zero;
            ProcessInfo child = new ProcessInfo();
            bool attributesReady = false, resumed = false;
            int stopping = 0;
            using (var channel = new NamedPipeClientStream(".", pipe, PipeDirection.Out)) {
                channel.Connect(10000);
                using (var writer = new StreamWriter(channel, new UTF8Encoding(false))) {
                    writer.NewLine = "\n";
                    writer.AutoFlush = true;
                    writer.WriteLine(token);
                    try {
                        job = CreateJobObjectW(IntPtr.Zero, IntPtr.Zero);
                        Check(job != IntPtr.Zero);
                        var limits = new ExtendedLimits();
                        limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway flags.
                        Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))));
                        writer.WriteLine("{\"ready\":true}");

                        // The worker authorizes launch only after the authenticated ready receipt.
                        // A queued cancellation or EOF during startup must never execute user code.
                        if (Console.In.ReadLine() != "start") {
                            Receipt(writer, "not_started", 1);
                            return 0;
                        }
                        var reader = new Thread(() => {
                            try { Console.In.ReadLine(); } catch (IOException) {}
                            Interlocked.Exchange(ref stopping, 1);
                        });
                        reader.IsBackground = true;
                        reader.Start();

                        var nul = CreateFileW("NUL", 0x80000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
                        Check(nul != new IntPtr(-1));
                        try { input = Inherit(nul); } finally { CloseHandle(nul); }
                        output = Inherit(GetStdHandle(-11));
                        error = Inherit(GetStdHandle(-12));
                        IntPtr size = IntPtr.Zero;
                        InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref size);
                        attributes = Marshal.AllocHGlobal(size);
                        Check(InitializeProcThreadAttributeList(attributes, 2, 0, ref size));
                        attributesReady = true;
                        handles = Marshal.AllocHGlobal(4 * IntPtr.Size);
                        Marshal.WriteIntPtr(handles, 0, input);
                        Marshal.WriteIntPtr(handles, IntPtr.Size, output);
                        Marshal.WriteIntPtr(handles, 2 * IntPtr.Size, error);
                        Check(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20002), handles,
                            new IntPtr(3 * IntPtr.Size), IntPtr.Zero, IntPtr.Zero));
                        // Windows 10+: no unowned-child window between CreateProcess and Job assignment.
                        IntPtr jobList = IntPtr.Add(handles, 3 * IntPtr.Size);
                        Marshal.WriteIntPtr(jobList, job);
                        Check(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x2000d), jobList,
                            new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero));
                        var startup = new StartupInfoEx();
                        startup.Startup.Size = (uint)Marshal.SizeOf(typeof(StartupInfoEx));
                        startup.Startup.Flags = 0x100; // STARTF_USESTDHANDLES
                        startup.Startup.Input = input;
                        startup.Startup.Output = output;
                        startup.Startup.Error = error;
                        startup.Attributes = attributes;
                        if (Interlocked.CompareExchange(ref stopping, 0, 0) != 0) {
                            Receipt(writer, "not_started", 1);
                            return 0;
                        }
                        var command = new StringBuilder("\"" + executable + "\" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\"");
                        // CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT
                        Check(CreateProcessW(executable, command, IntPtr.Zero, IntPtr.Zero, true,
                            0x08080004, IntPtr.Zero, cwd, ref startup, out child));
                        Check(ResumeThread(child.Thread) != UInt32.MaxValue);
                        resumed = true;
                        while (true) {
                            uint wait = WaitForSingleObject(child.Process, 20);
                            Check(wait != UInt32.MaxValue);
                            if (wait == 0 || Interlocked.CompareExchange(ref stopping, 0, 0) != 0) break;
                        }
                        // Natural parent exit also stops background descendants; this is a bounded command, not a service.
                        Check(TerminateJobObject(job, 1));
                        while (!Empty(job)) Thread.Sleep(10);
                        uint code;
                        Check(GetExitCodeProcess(child.Process, out code));
                        Receipt(writer, "exited", unchecked((int)code));
                        return 0;
                    } catch (Exception exception) {
                        Console.Error.WriteLine(exception.Message);
                        // A suspended child has never executed command code; terminate and wait before certifying it.
                        if (!resumed) {
                            if (child.Process != IntPtr.Zero) {
                                Check(TerminateProcess(child.Process, 1));
                                Check(WaitForSingleObject(child.Process, 5000) == 0);
                            }
                            Receipt(writer, "not_started", 127);
                            return 0;
                        }
                        return 1; // No completion evidence if a native lifecycle check failed.
                    } finally {
                        if (job != IntPtr.Zero) CloseHandle(job);
                        if (child.Thread != IntPtr.Zero) CloseHandle(child.Thread);
                        if (child.Process != IntPtr.Zero) CloseHandle(child.Process);
                        if (input != IntPtr.Zero) CloseHandle(input);
                        if (output != IntPtr.Zero) CloseHandle(output);
                        if (error != IntPtr.Zero) CloseHandle(error);
                        if (attributesReady) DeleteProcThreadAttributeList(attributes);
                        if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
                        if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
                    }
                }
            }
        }
    }
}
