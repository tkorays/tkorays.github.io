---
layout: post
title: 使用OpenGL ES shader做RGBA转YUV(I420)
---

最近在做android平台摄像头采集和视频渲染，当想要把性能做到极致的时候，总避不开使用GPU。在视频采集、美颜以及其他前处理之后，需要将数据转换成I420格式，方便后续处理，如果使用CPU去做会导致性能瓶颈。因为我们在前处理过程都是采用GPU去做，因此这个转换使用GPU去做不仅方便，而且能充分利用GPU的优势。

在编写OpenGL ES的shader前，先需要确定好fragment shader的输入和输出格式。输入可以是一个包含RGBA的texture，或者是分别包含Y、U、V的三个texture，也可以使包含Y和UV的两个texture（UV分别放在texture rgba的r和a中，NV21和NV12都可以用这种方式）。输出的texture不仅要包含所有的YUV信息，还要方便我们一次性读取I420格式数据（glReadPixels）。因此输出数据的YUV紧凑地分布：

```
    +---------+
    |         |
    |  Y      |
    |         |
    |         |
    +----+----+
    | U  | V  |
    |    |    |
    +----+----+
```

而对于OpenGL ES来说，目前它输入只认RGBA、lumiance、luminace alpha这几个格式，输出大多数实现只认RGBA格式，因此输出的数据格式虽然是I420格式，但是在存储是我们仍然要按照RGBA方式去访问texture数据。

对于上述存储布局，输出的texture宽度为width/4，高度为height+height/2。这样一张1280*720的图，需要申请的纹理大小为：360x1080。

先看看其fragment shader代码，一眼看去，简介明了：

```
// 在x方向上，一个像素的步长（纹理已经做过归一化，这个步长不是像素个数）
"uniform vec2 xUnit;\n"
// RGB to YUV的颜色转换系数
+ "uniform vec4 coeffs;\n"
+ "\n"
+ "void main() {\n"
// 虽然alpha通道值总是1，我们可以写成一个vec4xvec4的矩阵乘法，但是这样做实际
// 导致了较低帧率，这里用了vec3xvec3乘法。
// tc是texture coordinate，可以理解成输出纹理坐标
+ "  gl_FragColor.r = coeffs.a + dot(coeffs.rgb,\n"
+ "      sample(tc - 1.5 * xUnit).rgb);\n"
+ "  gl_FragColor.g = coeffs.a + dot(coeffs.rgb,\n"
+ "      sample(tc - 0.5 * xUnit).rgb);\n"
+ "  gl_FragColor.b = coeffs.a + dot(coeffs.rgb,\n"
+ "      sample(tc + 0.5 * xUnit).rgb);\n"
+ "  gl_FragColor.a = coeffs.a + dot(coeffs.rgb,\n"
+ "      sample(tc + 1.5 * xUnit).rgb);\n"
+ "}\n";
```

假设输出图片是1280x720大小的，那么GPU将并行地执行1280x720次main运算。例如输出纹理坐标`tc = vec2(x,y)`点，该像素点有RGBA四个数值需要填充，而且都需要填充成Y（或者U、V），那么它需要知道R、G、B、A应该取实际纹理的哪一点，对于Y直接映射到纹理图片中，取左右各两个点即可。Y通道从0，0处绘制，UV按照实际的位置做左边转换。

