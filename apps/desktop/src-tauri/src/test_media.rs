use media_remote::NowPlayingPerl;

fn main() {
    let perl = NowPlayingPerl::new();
    if let Some(info) = perl.get_info() {
        println!("{:#?}", info);
    }
}
