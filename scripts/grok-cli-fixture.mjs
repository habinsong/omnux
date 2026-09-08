import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

// 실제 모델·인증 서버에 접속하지 않는 실행 파일. 서버→CLI 전송 경계 검증에만 사용한다.
export function createGrokCliFixture(root) {
  const python = ["python3", "python"].find(binary => spawnSync(binary, ["--version"], { stdio: "ignore" }).status === 0);
  if (!python) throw new Error("Grok 실행 경로 검사에 Python이 필요합니다.");
  const directory = path.join(root, "grok-fixture");
  const output = path.join(directory, "bin");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "GrokFixture.csproj"), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net9.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings></PropertyGroup></Project>');
  writeFileSync(path.join(directory, "Program.cs"), `
if (args.Contains("version")) { Console.WriteLine("grok-fixture"); return 0; }
if (args.Contains("models")) {
    Console.WriteLine("You are logged in with auth.x.ai.\\nDefault model: grok-4.6\\nAvailable models:\\n  * grok-4.6 (default)\\n  - grok-fixture-custom");
    return 0;
}
var promptIndex = Array.IndexOf(args, "--prompt-file");
var modelIndex = Array.IndexOf(args, "--model");
if (promptIndex < 0 || modelIndex < 0) return 2;
var prompt = File.ReadAllText(args[promptIndex + 1]);
var model = args[modelIndex + 1];
var denyIndex = Array.IndexOf(args, "--deny");
if (denyIndex < 0 || args[denyIndex + 1] != "*") return 3;
if (File.Exists(Path.Combine(AppContext.BaseDirectory, "project-mode"))) {
    if (!prompt.Contains("REGISTERED_PROJECT_GUIDANCE")) return 46;
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new {
        analysis = "기존 프로젝트 확인", final_message = "프로젝트 파일 수정과 실행 완료", done = true,
        actions = new[] {
            new { type = "read_file", path = "source.txt", content = "", command = "" },
            new { type = "write_file", path = "main.py", content = "from pathlib import Path\\nprint(int(Path('source.txt').read_text()) * 2)\\n", command = "" },
            new { type = "run", path = "", content = "", command = "${python} main.py" }
        }
    }));
    return 0;
}
if (prompt.Contains("GROK_FIXTURE_RESUME") || (prompt.Contains("GROK_FIXTURE_TASK") && prompt.Contains("kept.txt ("))) {
    if (!prompt.Contains("kept.txt (")) return 43;
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new {
        analysis = "남아 있는 파일에서 이어가기", final_message = "이어서 실행 완료", done = true,
        actions = new[] {
            new { type = "write_file", path = "checkpoint.py", content = "print('resumed')\\n", command = "" },
            new { type = "run", path = "", content = "", command = "${python} checkpoint.py" }
        }
    }));
    return 0;
}
if (prompt.Contains("GROK_FIXTURE_CHECKPOINT") || prompt.Contains("GROK_FIXTURE_TASK")) {
    var marker = System.Text.Json.JsonSerializer.Serialize(Path.Combine(AppContext.BaseDirectory, "checkpoint-marker.json"));
    var code = "import os, json, time\\nfrom pathlib import Path\\nPath(" + marker + ").write_text(json.dumps({'pid': os.getpid(), 'cwd': os.getcwd()}))\\ntime.sleep(30)\\n";
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new {
        analysis = "파일 작성 후 중단 검증", final_message = "모의 작업", done = true,
        actions = new[] {
            new { type = "write_file", path = "kept.txt", content = "keep this content", command = "" },
            new { type = "write_file", path = "checkpoint.py", content = code, command = "" },
            new { type = "run", path = "", content = "", command = "${python} checkpoint.py" }
        }
    }));
    return 0;
}
if (prompt.Contains("GROK_FIXTURE_WAIT")) {
    File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "waiting.pid"), Environment.ProcessId.ToString());
    await Task.Delay(TimeSpan.FromSeconds(30));
}
if (prompt.Contains("GROK_FIXTURE_FAILURE")) return 42;
if (prompt.Contains("GROK_FIXTURE_PLAN")) {
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new {
        title = "Grok fixture plan",
        steps = new[] { new { title = "파일 구현", description = "모의 파일 구현 단계", mustDo = new[] { "main.py 작성" }, mustNotDo = new[] { "외부 API 호출 금지" }, verification = new[] { "Python 실행" } } },
        summary = "Grok fixture review", findings = Array.Empty<string>(), risks = Array.Empty<string>(), missingVerification = Array.Empty<string>(), approvedRecommendation = true
    }));
    return 0;
}
if (prompt.Contains("GROK_FIXTURE_CODE")) {
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new {
        analysis = "모의 코딩 계획",
        final_message = "파일 작성과 실행 검증 완료",
        done = true,
        actions = new[] {
            new { type = "write_file", path = "main.py", content = "def triangular(n):\\n    return sum(range(1, n + 1))\\n\\nif __name__ == '__main__':\\n    print(triangular(10))\\n", command = "" },
            new { type = "run", path = "", content = "", command = "${python} main.py" }
        }
    }));
    return 0;
}
Console.WriteLine("GROK_FIXTURE_RESPONSE " + model);
return 0;
`);
  execFileSync("dotnet", ["build", path.join(directory, "GrokFixture.csproj"), "--nologo", "-o", output], {
    stdio: "pipe", timeout: 60000
  });
  return path.join(output, process.platform === "win32" ? "GrokFixture.exe" : "GrokFixture");
}
