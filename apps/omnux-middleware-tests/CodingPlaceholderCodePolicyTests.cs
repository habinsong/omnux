using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingPlaceholderCodePolicyTests
{
    private static Dictionary<string, string> Sources(params (string Path, string Content)[] files)
    {
        return files.ToDictionary(item => item.Path, item => item.Content, StringComparer.Ordinal);
    }

    [Fact]
    public void 할_일_관리자는_도메인_용어_때문에_더미로_몰리지_않는다()
    {
        var sources = Sources(
            ("todo_cli/models.py", string.Join("\n", Enumerable.Repeat("class Todo:\n    def __init__(self, title):\n        self.title = title", 12))),
            ("todo_cli/storage.py", "def save_todos(todos, path):\n    path.write_text(json.dumps(todos))\n\ndef load_todos(path):\n    return json.loads(path.read_text())"),
            ("tests/test_todo_cli.py", "def test_add_todo():\n    assert add_todo('빵 사기') is not None")
        );

        Assert.False(CodingPlaceholderCodePolicy.LooksPlaceholderHeavy(sources));
    }

    [Fact]
    public void 주석에_적힌_미구현_표시는_잡는다()
    {
        var sources = Sources(
            ("app.py", "def run():\n    # TODO: 구현 필요\n    pass\n\ndef save():\n    # FIXME 저장 안 됨\n    pass")
        );

        Assert.True(CodingPlaceholderCodePolicy.LooksPlaceholderHeavy(sources));
    }

    [Fact]
    public void 미구현_예외는_표시로_본다()
    {
        var sources = Sources(
            ("service.py", "def compute():\n    raise NotImplementedError('아직')"),
            ("other.cs", "public void Save() { throw new NotImplementedException(); }")
        );

        Assert.True(CodingPlaceholderCodePolicy.LooksPlaceholderHeavy(sources));
    }

    [Fact]
    public void 입력칸_placeholder_속성은_미구현이_아니다()
    {
        var sources = Sources(
            ("index.html", string.Join("\n", Enumerable.Repeat("<input placeholder=\"이름을 입력하세요\" class=\"field\">", 30)))
        );

        Assert.False(CodingPlaceholderCodePolicy.LooksPlaceholderHeavy(sources));
    }

    [Fact]
    public void 짧은_코드에_표시가_하나만_있어도_미구현으로_본다()
    {
        var sources = Sources(("main.py", "def main():\n    # TODO: 전부 구현\n    pass"));

        Assert.True(CodingPlaceholderCodePolicy.LooksPlaceholderHeavy(sources));
    }

    [Fact]
    public void 소문자_todo_식별자는_표시가_아니다()
    {
        Assert.Equal(0, CodingPlaceholderCodePolicy.CountMarkers("todo_cli, add_todo(item), \"todo\": []"));
    }
}
