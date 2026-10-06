#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#include <math.h>

// Line protocol on private stdin/stdout. No click synthesis or cursor hiding.
static CGPoint currentPoint(void) {
    CGEventRef event = CGEventCreate(NULL);
    CGPoint point = CGEventGetLocation(event);
    CFRelease(event);
    return point;
}
static double distance(CGPoint a, CGPoint b) { return hypot(a.x-b.x, a.y-b.y); }
int main(void) {
    @autoreleasepool {
        char *line = NULL; size_t size = 0;
        NSString *token = nil; CGPoint expected = CGPointZero; double expires = 0;
        while (getline(&line, &size, stdin) > 0) {
            @autoreleasepool {
                NSDictionary *request = [NSJSONSerialization JSONObjectWithData:[[NSString stringWithUTF8String:line] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
                NSString *op = request[@"op"], *reason = nil;
                CGPoint actual = currentPoint(); BOOL ok = YES;
                double now = [[NSDate date] timeIntervalSince1970] * 1000;
                if ([op isEqual:@"get"]) { /* read only */ }
                else if ([op isEqual:@"cancel"]) { token = nil; }
                else if ([op isEqual:@"begin"]) {
                    token = request[@"token"]; expected = actual; expires = now + 400;
                } else if ([op isEqual:@"step"]) {
                    NSArray *point = request[@"point"];
                    if (!token || ![token isEqual:request[@"token"]] || now > expires || fabs(now-[request[@"time"] doubleValue]) > 50) reason = @"stale-native-frame";
                    else if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != [request[@"pid"] intValue]) reason = @"native-window-inactive";
                    else if (distance(actual, expected) > 1.5) reason = @"user-moved";
                    else if (point.count != 2 || !isfinite([point[0] doubleValue]) || !isfinite([point[1] doubleValue])) reason = @"invalid-native-point";
                    else {
                        CGPoint target = CGPointMake([point[0] doubleValue], [point[1] doubleValue]);
                        // Preserve the accepted compatibility fix. This is scoped to
                        // a single warp and restores the documented default even
                        // on failure. Reassociation alone leaves a ~250ms pause.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
                        CGError suppression = CGSetLocalEventsSuppressionInterval(0.0);
                        CGError warped = suppression == kCGErrorSuccess ? CGWarpMouseCursorPosition(target) : suppression;
                        CGError restored = CGSetLocalEventsSuppressionInterval(0.25);
#pragma clang diagnostic pop
                        CGError associated = CGAssociateMouseAndMouseCursorPosition(true);
                        actual = currentPoint();
                        if (warped || restored || associated || distance(actual, target) > 2) reason = @"warp-not-confirmed";
                        else expected = actual;
                    }
                    if (reason) token = nil;
                } else reason = @"unknown-operation";
                ok = reason == nil;
                NSDictionary *reply = @{@"id":request[@"id"] ?: @0, @"ok":@(ok), @"reason":reason ?: @"", @"point":@[@(actual.x), @(actual.y)]};
                NSData *data = [NSJSONSerialization dataWithJSONObject:reply options:0 error:nil];
                fwrite(data.bytes, 1, data.length, stdout); fputc('\n', stdout); fflush(stdout);
            }
        }
        free(line);
    }
    return 0;
}
